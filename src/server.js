'use strict';

const path = require('node:path');
const express = require('express');

const {
  createDb,
  getSetting,
  setSetting,
  getRpoTierPercents,
  getRpoRoleShares,
  generateSignupCode,
} = require('./db');
const auth = require('./auth');
const calc = require('./calc');

function isValidMonth(m) {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}
function isValidYear(y) {
  return Number.isInteger(y) && y >= 2000 && y <= 2100;
}

function createApp(dbPath) {
  const db = createDb(dbPath);
  const app = express();
  // Render/Railway 等のリバースプロキシ配下で req.secure を正しく判定するため
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(auth.sessionMiddleware(db));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ホスティングサービスのヘルスチェック用
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ---------------- 認証 ----------------

  // 最初に登録したアカウントがオーナーになる。
  // 2人目以降は、オーナーが設定画面で確認できる「招待コード」が必要。
  app.post('/api/register', (req, res) => {
    const { email, name, password, signupCode } = req.body || {};
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'メールアドレス・氏名・パスワードは必須です' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const role = count === 0 ? 'owner' : 'member';
    if (count > 0) {
      const expected = getSetting(db, 'signup_code');
      if (!expected || String(signupCode || '').trim() !== expected) {
        return res.status(403).json({ error: '招待コードが正しくありません（オーナーに確認してください）' });
      }
    }
    let userId;
    try {
      const result = db
        .prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(String(email).trim().toLowerCase(), String(name).trim(), auth.hashPassword(String(password)), role);
      userId = Number(result.lastInsertRowid);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
      }
      throw err;
    }
    // オーナー登録時に招待コードを自動生成（設定画面で確認・変更できる）
    if (role === 'owner' && !getSetting(db, 'signup_code')) {
      setSetting(db, 'signup_code', generateSignupCode());
    }
    const token = auth.createSession(db, userId);
    auth.setSessionCookie(req, res, token);
    res.json({ id: userId, email, name, role });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email || '').trim().toLowerCase());
    if (!user || !auth.verifyPassword(String(password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }
    const token = auth.createSession(db, user.id);
    auth.setSessionCookie(req, res, token);
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  });

  app.post('/api/logout', (req, res) => {
    if (req.sessionToken) auth.destroySession(db, req.sessionToken);
    auth.clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: '未ログイン' });
    res.json(req.user);
  });

  // ---------------- 基本給（本人のみ） ----------------

  app.get('/api/base-salary', auth.requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, amount, effective_year AS effectiveYear, effective_month AS effectiveMonth, created_at AS createdAt
         FROM base_salaries WHERE user_id = ?
         ORDER BY effective_year DESC, effective_month DESC, id DESC`
      )
      .all(req.user.id);
    res.json(rows);
  });

  app.post('/api/base-salary', auth.requireAuth, (req, res) => {
    const amount = Number(req.body?.amount);
    const effectiveYear = Number(req.body?.effectiveYear);
    const effectiveMonth = Number(req.body?.effectiveMonth);
    if (!Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ error: '基本給は0以上の整数で入力してください' });
    }
    if (!isValidYear(effectiveYear) || !isValidMonth(effectiveMonth)) {
      return res.status(400).json({ error: '発効年月が不正です' });
    }
    const result = db
      .prepare(
        'INSERT INTO base_salaries (user_id, amount, effective_year, effective_month) VALUES (?, ?, ?, ?)'
      )
      .run(req.user.id, amount, effectiveYear, effectiveMonth);
    res.json({ id: Number(result.lastInsertRowid), amount, effectiveYear, effectiveMonth });
  });

  // ---------------- 採用イベント（登録はオーナー、閲覧は全員） ----------------

  app.get('/api/events', auth.requireAuth, (req, res) => {
    const rows = db
      .prepare('SELECT id, name, event_date AS eventDate FROM events ORDER BY event_date, id')
      .all();
    res.json(rows);
  });

  app.post('/api/events', auth.requireOwner, (req, res) => {
    const { name, eventDate } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'イベント名は必須です' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate || ''))) {
      return res.status(400).json({ error: '開催日は YYYY-MM-DD 形式で入力してください' });
    }
    const result = db
      .prepare('INSERT INTO events (name, event_date) VALUES (?, ?)')
      .run(String(name).trim(), String(eventDate));
    res.json({ id: Number(result.lastInsertRowid), name: String(name).trim(), eventDate });
  });

  // イベントの編集（名前・開催日）。開催日を変えると支給月・単価の計算にも自動反映される。
  app.put('/api/events/:id', auth.requireOwner, (req, res) => {
    const id = Number(req.params.id);
    const { name, eventDate } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'イベント名は必須です' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate || ''))) {
      return res.status(400).json({ error: '開催日は YYYY-MM-DD 形式で入力してください' });
    }
    const result = db
      .prepare('UPDATE events SET name = ?, event_date = ? WHERE id = ?')
      .run(String(name).trim(), String(eventDate), id);
    if (result.changes === 0) return res.status(404).json({ error: 'イベントが見つかりません' });
    res.json({ id, name: String(name).trim(), eventDate });
  });

  app.delete('/api/events/:id', auth.requireOwner, (req, res) => {
    const id = Number(req.params.id);
    const used = db
      .prepare('SELECT COUNT(*) AS c FROM event_orders WHERE event_id = ?')
      .get(id).c;
    if (used > 0) {
      return res.status(409).json({ error: '受注が登録されているイベントは削除できません' });
    }
    const result = db.prepare('DELETE FROM events WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'イベントが見つかりません' });
    res.json({ ok: true });
  });

  // ---------------- イベント受注（本人のみ） ----------------

  function listOrders(userId) {
    return db
      .prepare(
        `SELECT o.id, o.event_id AS eventId, o.slots, o.amount,
                o.order_year AS orderYear, o.order_month AS orderMonth,
                e.name AS eventName, e.event_date AS eventDate
         FROM event_orders o JOIN events e ON e.id = o.event_id
         WHERE o.user_id = ?
         ORDER BY o.order_year, o.order_month, e.event_date, o.id`
      )
      .all(userId);
  }

  app.get('/api/orders', auth.requireAuth, (req, res) => {
    res.json(listOrders(req.user.id));
  });

  app.post('/api/orders', auth.requireAuth, (req, res) => {
    const eventId = Number(req.body?.eventId);
    const slots = Number(req.body?.slots);
    const amount = Number(req.body?.amount ?? 0);
    const orderYear = Number(req.body?.orderYear);
    const orderMonth = Number(req.body?.orderMonth);
    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(400).json({ error: '指定されたイベントが存在しません' });
    if (!Number.isInteger(slots) || slots < 1) {
      return res.status(400).json({ error: '枠数は1以上の整数で入力してください' });
    }
    if (!Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ error: '受注金額は0以上の整数で入力してください' });
    }
    if (!isValidYear(orderYear) || !isValidMonth(orderMonth)) {
      return res.status(400).json({ error: '受注年月が不正です' });
    }
    const result = db
      .prepare(
        'INSERT INTO event_orders (user_id, event_id, slots, amount, order_year, order_month) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(req.user.id, eventId, slots, amount, orderYear, orderMonth);
    res.json({ id: Number(result.lastInsertRowid) });
  });

  // 複数イベントの受注を一括登録（同じ受注年月でまとめて登録する）
  app.post('/api/orders/bulk', auth.requireAuth, (req, res) => {
    const orderYear = Number(req.body?.orderYear);
    const orderMonth = Number(req.body?.orderMonth);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!isValidYear(orderYear) || !isValidMonth(orderMonth)) {
      return res.status(400).json({ error: '受注年月が不正です' });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: 'イベントを1つ以上選択してください' });
    }
    const findEvent = db.prepare('SELECT id FROM events WHERE id = ?');
    for (const item of items) {
      const slots = Number(item?.slots);
      const amount = Number(item?.amount ?? 0);
      if (!findEvent.get(Number(item?.eventId))) {
        return res.status(400).json({ error: '指定されたイベントが存在しません' });
      }
      if (!Number.isInteger(slots) || slots < 1) {
        return res.status(400).json({ error: '枠数は1以上の整数で入力してください' });
      }
      if (!Number.isInteger(amount) || amount < 0) {
        return res.status(400).json({ error: '受注金額は0以上の整数で入力してください' });
      }
    }
    const insert = db.prepare(
      'INSERT INTO event_orders (user_id, event_id, slots, amount, order_year, order_month) VALUES (?, ?, ?, ?, ?, ?)'
    );
    db.exec('BEGIN');
    try {
      for (const item of items) {
        insert.run(
          req.user.id,
          Number(item.eventId),
          Number(item.slots),
          Number(item.amount ?? 0),
          orderYear,
          orderMonth
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ count: items.length });
  });

  // 自分の受注を一括削除
  app.post('/api/orders/delete', auth.requireAuth, (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number)
      .filter(Number.isInteger);
    if (ids.length === 0) {
      return res.status(400).json({ error: '削除する受注を選択してください' });
    }
    const del = db.prepare('DELETE FROM event_orders WHERE id = ? AND user_id = ?');
    let deleted = 0;
    db.exec('BEGIN');
    try {
      for (const id of ids) deleted += del.run(id, req.user.id).changes;
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ deleted });
  });

  app.delete('/api/orders/:id', auth.requireAuth, (req, res) => {
    const result = db
      .prepare('DELETE FROM event_orders WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: '受注が見つかりません' });
    res.json({ ok: true });
  });

  // ---------------- RPO 案件（登録・編集はオーナー、閲覧は全員） ----------------

  function validateDealBody(body) {
    const clientName = String(body?.clientName || '').trim();
    const monthlyProfit = Number(body?.monthlyProfit);
    const startYear = Number(body?.startYear);
    const startMonth = Number(body?.startMonth);
    const termMonths = Number(body?.termMonths);
    if (!clientName) return { error: '案件名（クライアント名）は必須です' };
    if (!Number.isInteger(monthlyProfit) || monthlyProfit < 0) {
      return { error: '月間粗利は0以上の整数で入力してください' };
    }
    if (!isValidYear(startYear) || !isValidMonth(startMonth)) {
      return { error: '契約開始年月が不正です' };
    }
    if (termMonths !== 6 && termMonths !== 12) {
      return { error: '契約期間は半年(6)か1年(12)を選択してください' };
    }
    return { clientName, monthlyProfit, startYear, startMonth, termMonths };
  }

  // 全案件を担当者情報つきで返す（社員はここから担当する案件を選ぶ）
  function listDealsWithAssignments() {
    const deals = db
      .prepare(
        `SELECT id, client_name AS clientName, monthly_profit AS monthlyProfit,
                start_year AS startYear, start_month AS startMonth, term_months AS termMonths
         FROM rpo_deals ORDER BY start_year, start_month, id`
      )
      .all();
    const assignments = db
      .prepare(
        `SELECT a.id, a.deal_id AS dealId, a.user_id AS userId, a.role, u.name AS userName
         FROM rpo_assignments a JOIN users u ON u.id = a.user_id`
      )
      .all();
    for (const deal of deals) {
      deal.mains = assignments.filter((a) => a.dealId === deal.id && a.role === 'main');
      deal.subs = assignments.filter((a) => a.dealId === deal.id && a.role === 'sub');
    }
    return deals;
  }

  app.get('/api/rpo-deals', auth.requireAuth, (req, res) => {
    res.json(listDealsWithAssignments());
  });

  app.post('/api/rpo-deals', auth.requireOwner, (req, res) => {
    const v = validateDealBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const result = db
      .prepare(
        'INSERT INTO rpo_deals (client_name, monthly_profit, start_year, start_month, term_months) VALUES (?, ?, ?, ?, ?)'
      )
      .run(v.clientName, v.monthlyProfit, v.startYear, v.startMonth, v.termMonths);
    res.json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/rpo-deals/:id', auth.requireOwner, (req, res) => {
    const v = validateDealBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const result = db
      .prepare(
        'UPDATE rpo_deals SET client_name = ?, monthly_profit = ?, start_year = ?, start_month = ?, term_months = ? WHERE id = ?'
      )
      .run(v.clientName, v.monthlyProfit, v.startYear, v.startMonth, v.termMonths, Number(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: '案件が見つかりません' });
    res.json({ ok: true });
  });

  app.delete('/api/rpo-deals/:id', auth.requireOwner, (req, res) => {
    // 担当（rpo_assignments）は ON DELETE CASCADE で一緒に削除される
    const result = db.prepare('DELETE FROM rpo_deals WHERE id = ?').run(Number(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: '案件が見つかりません' });
    res.json({ ok: true });
  });

  // ---------------- RPO 担当（社員がメイン/サブを選ぶ） ----------------

  app.post('/api/rpo-assignments', auth.requireAuth, (req, res) => {
    const dealId = Number(req.body?.dealId);
    const role = String(req.body?.role || '');
    if (role !== 'main' && role !== 'sub') {
      return res.status(400).json({ error: '担当はメイン(main)かサブ(sub)を指定してください' });
    }
    const deal = db.prepare('SELECT id FROM rpo_deals WHERE id = ?').get(dealId);
    if (!deal) return res.status(400).json({ error: '指定された案件が存在しません' });
    try {
      const result = db
        .prepare('INSERT INTO rpo_assignments (deal_id, user_id, role) VALUES (?, ?, ?)')
        .run(dealId, req.user.id, role);
      res.json({ id: Number(result.lastInsertRowid) });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'あなたは既にこの案件を担当しています' });
      }
      throw err;
    }
  });

  // 複数案件の担当をまとめて追加（メイン5社・サブ5社のような持ち方に対応）
  // 同じ担当に複数人がつくことも可能（インセンティブ計算時に粗利を人数で等分）
  app.post('/api/rpo-assignments/bulk', auth.requireAuth, (req, res) => {
    const role = String(req.body?.role || '');
    const dealIds = (Array.isArray(req.body?.dealIds) ? req.body.dealIds : [])
      .map(Number)
      .filter(Number.isInteger);
    if (role !== 'main' && role !== 'sub') {
      return res.status(400).json({ error: '担当はメイン(main)かサブ(sub)を指定してください' });
    }
    if (dealIds.length === 0) {
      return res.status(400).json({ error: '案件を1つ以上選択してください' });
    }
    // 事前チェック: 案件の存在・自分が既に担当していないか
    const findDeal = db.prepare('SELECT id, client_name AS clientName FROM rpo_deals WHERE id = ?');
    const findMine = db.prepare('SELECT id FROM rpo_assignments WHERE deal_id = ? AND user_id = ?');
    for (const dealId of dealIds) {
      const deal = findDeal.get(dealId);
      if (!deal) return res.status(400).json({ error: '指定された案件が存在しません' });
      if (findMine.get(dealId, req.user.id)) {
        return res.status(409).json({ error: `「${deal.clientName}」は既にあなたが担当しています` });
      }
    }
    const insert = db.prepare('INSERT INTO rpo_assignments (deal_id, user_id, role) VALUES (?, ?, ?)');
    db.exec('BEGIN');
    try {
      for (const dealId of dealIds) insert.run(dealId, req.user.id, role);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ count: dealIds.length });
  });

  // 自分の担当を外れる（オーナーは誰の担当でも解除できる）
  app.delete('/api/rpo-assignments/:id', auth.requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const result =
      req.user.role === 'owner'
        ? db.prepare('DELETE FROM rpo_assignments WHERE id = ?').run(id)
        : db.prepare('DELETE FROM rpo_assignments WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: '担当が見つかりません' });
    res.json({ ok: true });
  });

  // ---------------- 給与計算 ----------------

  // 本人が担当（メイン/サブ）している案件を役割・同担当人数つきで返す。
  // roleMemberCount はその案件の同じ担当についている人数（粗利の等分に使う）。
  function listUserAssignments(userId) {
    return db
      .prepare(
        `SELECT a.role, d.client_name AS clientName, d.monthly_profit AS monthlyProfit,
                d.start_year AS startYear, d.start_month AS startMonth, d.term_months AS termMonths,
                (SELECT COUNT(*) FROM rpo_assignments a2
                 WHERE a2.deal_id = a.deal_id AND a2.role = a.role) AS roleMemberCount
         FROM rpo_assignments a JOIN rpo_deals d ON d.id = a.deal_id
         WHERE a.user_id = ?
         ORDER BY d.start_year, d.start_month, d.id`
      )
      .all(userId);
  }

  function salaryBreakdown(userId, year, month) {
    const baseRecords = db
      .prepare(
        `SELECT id, amount, effective_year AS effectiveYear, effective_month AS effectiveMonth
         FROM base_salaries WHERE user_id = ?`
      )
      .all(userId);
    return calc.salaryForMonth(
      {
        baseRecords,
        orders: listOrders(userId),
        assignments: listUserAssignments(userId),
        tierPercents: getRpoTierPercents(db),
        roleShares: getRpoRoleShares(db),
      },
      year,
      month
    );
  }

  // 自分の給与明細（他のメンバーの給与は見えない）
  app.get('/api/salary', auth.requireAuth, (req, res) => {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!isValidYear(year) || !isValidMonth(month)) {
      return res.status(400).json({ error: '年月が不正です' });
    }
    res.json(salaryBreakdown(req.user.id, year, month));
  });

  // ---------------- 設定（RPO 率。閲覧は全員、変更はオーナー） ----------------

  function settingsPayload() {
    const tiers = getRpoTierPercents(db);
    const shares = getRpoRoleShares(db);
    const payload = {
      rpoMainPercent: shares.main,
      rpoSubPercent: shares.sub,
      profitThresholdPercent: Number(getSetting(db, 'profit_threshold_percent') ?? 30),
    };
    tiers.forEach((value, i) => {
      payload[`rpoTier${i + 1}Percent`] = value;
    });
    return payload;
  }

  app.get('/api/settings', auth.requireAuth, (req, res) => {
    const payload = settingsPayload();
    // 招待コードはオーナーにのみ表示
    if (req.user.role === 'owner') {
      payload.signupCode = getSetting(db, 'signup_code') || '';
    }
    res.json(payload);
  });

  app.put('/api/settings', auth.requireOwner, (req, res) => {
    const keys = [
      ['rpoTier1Percent', 'rpo_tier1_percent'],
      ['rpoTier2Percent', 'rpo_tier2_percent'],
      ['rpoTier3Percent', 'rpo_tier3_percent'],
      ['rpoTier4Percent', 'rpo_tier4_percent'],
      ['rpoTier5Percent', 'rpo_tier5_percent'],
      ['rpoTier6Percent', 'rpo_tier6_percent'],
      ['rpoTier7Percent', 'rpo_tier7_percent'],
      ['rpoMainPercent', 'rpo_main_percent'],
      ['rpoSubPercent', 'rpo_sub_percent'],
      ['profitThresholdPercent', 'profit_threshold_percent'],
    ];
    for (const [bodyKey] of keys) {
      const v = Number(req.body?.[bodyKey]);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return res.status(400).json({ error: 'パーセンテージは0〜100の数値で入力してください' });
      }
    }
    const signupCode = String(req.body?.signupCode ?? '').trim();
    if (signupCode.length < 4) {
      return res.status(400).json({ error: '招待コードは4文字以上にしてください' });
    }
    for (const [bodyKey, settingKey] of keys) {
      setSetting(db, settingKey, Number(req.body[bodyKey]));
    }
    setSetting(db, 'signup_code', signupCode);
    res.json({ ...settingsPayload(), signupCode });
  });

  // ---------------- 粗利の可視化（損益グラフ） ----------------

  function profitSeries(userId, year) {
    const baseRecords = db
      .prepare(
        `SELECT id, amount, effective_year AS effectiveYear, effective_month AS effectiveMonth
         FROM base_salaries WHERE user_id = ?`
      )
      .all(userId);
    return calc.profitSeriesForYear(
      {
        assignments: listUserAssignments(userId),
        orders: listOrders(userId),
        baseRecords,
        roleShares: getRpoRoleShares(db),
        thresholdPercent: Number(getSetting(db, 'profit_threshold_percent') ?? 30),
      },
      year
    );
  }

  // 自分の月次粗利と損益判定（1年分）
  app.get('/api/profit', auth.requireAuth, (req, res) => {
    const year = Number(req.query.year);
    if (!isValidYear(year)) return res.status(400).json({ error: '年が不正です' });
    res.json({
      year,
      thresholdPercent: Number(getSetting(db, 'profit_threshold_percent') ?? 30),
      months: profitSeries(req.user.id, year),
    });
  });

  // 全メンバーの月次粗利と損益判定（オーナーのみ）
  app.get('/api/admin/profit', auth.requireOwner, (req, res) => {
    const year = Number(req.query.year);
    if (!isValidYear(year)) return res.status(400).json({ error: '年が不正です' });
    const users = db.prepare('SELECT id, name FROM users ORDER BY id').all();
    res.json({
      year,
      thresholdPercent: Number(getSetting(db, 'profit_threshold_percent') ?? 30),
      users: users.map((u) => ({
        userId: u.id,
        userName: u.name,
        months: profitSeries(u.id, year),
      })),
    });
  });

  // ---------------- オーナー用（メンバー一覧・メンバー給与） ----------------

  app.get('/api/admin/users', auth.requireOwner, (req, res) => {
    const rows = db
      .prepare('SELECT id, email, name, role, created_at AS createdAt FROM users ORDER BY id')
      .all();
    res.json(rows);
  });

  // メンバーの権限変更（オーナーのみ）。オーナーが0人にならないようガードする。
  app.put('/api/admin/users/:id/role', auth.requireOwner, (req, res) => {
    const id = Number(req.params.id);
    const role = String(req.body?.role || '');
    if (role !== 'owner' && role !== 'member') {
      return res.status(400).json({ error: '権限は owner か member を指定してください' });
    }
    const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (user.role === role) return res.json({ id, role });
    if (user.role === 'owner' && role === 'member') {
      const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get().c;
      if (owners <= 1) {
        return res.status(400).json({ error: 'オーナーは最低1人必要です。先に他のメンバーをオーナーにしてください' });
      }
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    res.json({ id, role });
  });

  app.get('/api/admin/salary', auth.requireOwner, (req, res) => {
    const userId = Number(req.query.userId);
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (!isValidYear(year) || !isValidMonth(month)) {
      return res.status(400).json({ error: '年月が不正です' });
    }
    res.json({ userName: user.name, ...salaryBreakdown(userId, year, month) });
  });

  app.locals.db = db;
  return app;
}

if (require.main === module) {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'voco.sqlite');
  const port = Number(process.env.PORT || 3000);
  const app = createApp(dbPath);
  app.listen(port, () => {
    console.log(`VOCO 給与システム: http://localhost:${port} (DB: ${dbPath})`);
  });
}

module.exports = { createApp };
