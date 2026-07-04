'use strict';

const path = require('node:path');
const express = require('express');

const { createDb, getSetting, setSetting, getRpoTierPercents } = require('./db');
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
  app.use(express.json());
  app.use(auth.sessionMiddleware(db));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ---------------- 認証 ----------------

  // 最初に登録したアカウントがオーナーになる
  app.post('/api/register', (req, res) => {
    const { email, name, password } = req.body || {};
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'メールアドレス・氏名・パスワードは必須です' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const role = count === 0 ? 'owner' : 'member';
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
    const token = auth.createSession(db, userId);
    auth.setSessionCookie(res, token);
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
    auth.setSessionCookie(res, token);
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  });

  app.post('/api/logout', (req, res) => {
    if (req.sessionToken) auth.destroySession(db, req.sessionToken);
    auth.clearSessionCookie(res);
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
        `SELECT o.id, o.event_id AS eventId, o.slots,
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
    const orderYear = Number(req.body?.orderYear);
    const orderMonth = Number(req.body?.orderMonth);
    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(400).json({ error: '指定されたイベントが存在しません' });
    if (!Number.isInteger(slots) || slots < 1) {
      return res.status(400).json({ error: '枠数は1以上の整数で入力してください' });
    }
    if (!isValidYear(orderYear) || !isValidMonth(orderMonth)) {
      return res.status(400).json({ error: '受注年月が不正です' });
    }
    const result = db
      .prepare(
        'INSERT INTO event_orders (user_id, event_id, slots, order_year, order_month) VALUES (?, ?, ?, ?, ?)'
      )
      .run(req.user.id, eventId, slots, orderYear, orderMonth);
    res.json({ id: Number(result.lastInsertRowid) });
  });

  app.delete('/api/orders/:id', auth.requireAuth, (req, res) => {
    const result = db
      .prepare('DELETE FROM event_orders WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: '受注が見つかりません' });
    res.json({ ok: true });
  });

  // ---------------- RPO 案件（本人のみ） ----------------

  function listDeals(userId) {
    return db
      .prepare(
        `SELECT id, client_name AS clientName, monthly_profit AS monthlyProfit,
                start_year AS startYear, start_month AS startMonth, term_months AS termMonths
         FROM rpo_deals WHERE user_id = ?
         ORDER BY start_year, start_month, id`
      )
      .all(userId);
  }

  app.get('/api/rpo', auth.requireAuth, (req, res) => {
    res.json(listDeals(req.user.id));
  });

  app.post('/api/rpo', auth.requireAuth, (req, res) => {
    const clientName = String(req.body?.clientName || '').trim();
    const monthlyProfit = Number(req.body?.monthlyProfit);
    const startYear = Number(req.body?.startYear);
    const startMonth = Number(req.body?.startMonth);
    const termMonths = Number(req.body?.termMonths);
    if (!clientName) return res.status(400).json({ error: '案件名（クライアント名）は必須です' });
    if (!Number.isInteger(monthlyProfit) || monthlyProfit < 0) {
      return res.status(400).json({ error: '月間粗利は0以上の整数で入力してください' });
    }
    if (!isValidYear(startYear) || !isValidMonth(startMonth)) {
      return res.status(400).json({ error: '契約開始年月が不正です' });
    }
    if (termMonths !== 6 && termMonths !== 12) {
      return res.status(400).json({ error: '契約期間は半年(6)か1年(12)を選択してください' });
    }
    const result = db
      .prepare(
        'INSERT INTO rpo_deals (user_id, client_name, monthly_profit, start_year, start_month, term_months) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(req.user.id, clientName, monthlyProfit, startYear, startMonth, termMonths);
    res.json({ id: Number(result.lastInsertRowid) });
  });

  app.delete('/api/rpo/:id', auth.requireAuth, (req, res) => {
    const result = db
      .prepare('DELETE FROM rpo_deals WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: '案件が見つかりません' });
    res.json({ ok: true });
  });

  // ---------------- 給与計算 ----------------

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
        deals: listDeals(userId),
        tierPercents: getRpoTierPercents(db),
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

  app.get('/api/settings', auth.requireAuth, (req, res) => {
    const [tier1, tier2, tier3, tier4] = getRpoTierPercents(db);
    res.json({
      rpoTier1Percent: tier1,
      rpoTier2Percent: tier2,
      rpoTier3Percent: tier3,
      rpoTier4Percent: tier4,
    });
  });

  app.put('/api/settings', auth.requireOwner, (req, res) => {
    const keys = [
      ['rpoTier1Percent', 'rpo_tier1_percent'],
      ['rpoTier2Percent', 'rpo_tier2_percent'],
      ['rpoTier3Percent', 'rpo_tier3_percent'],
      ['rpoTier4Percent', 'rpo_tier4_percent'],
    ];
    for (const [bodyKey] of keys) {
      const v = Number(req.body?.[bodyKey]);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return res.status(400).json({ error: 'パーセンテージは0〜100の数値で入力してください' });
      }
    }
    for (const [bodyKey, settingKey] of keys) {
      setSetting(db, settingKey, Number(req.body[bodyKey]));
    }
    const [tier1, tier2, tier3, tier4] = getRpoTierPercents(db);
    res.json({
      rpoTier1Percent: tier1,
      rpoTier2Percent: tier2,
      rpoTier3Percent: tier3,
      rpoTier4Percent: tier4,
    });
  });

  // ---------------- オーナー用（メンバー一覧・メンバー給与） ----------------

  app.get('/api/admin/users', auth.requireOwner, (req, res) => {
    const rows = db
      .prepare('SELECT id, email, name, role, created_at AS createdAt FROM users ORDER BY id')
      .all();
    res.json(rows);
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
