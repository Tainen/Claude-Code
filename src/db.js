'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_SETTINGS = {
  // RPO 保有粗利帯ごとのインセンティブ率 (%)。オーナーが設定画面から変更できる。
  rpo_tier1_percent: '3', // 〜100万円
  rpo_tier2_percent: '5', // 100万円超〜150万円
  rpo_tier3_percent: '7', // 150万円超〜200万円
  rpo_tier4_percent: '10', // 200万円超
  // RPO 担当割合 (%)。オーナーが設定画面から変更できる。
  rpo_main_percent: '80', // メイン担当
  rpo_sub_percent: '20', // サブ担当
};

function createDb(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    -- 基本給の履歴。発効年月以降、次の変更まで毎月適用される。
    CREATE TABLE IF NOT EXISTS base_salaries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount          INTEGER NOT NULL CHECK (amount >= 0),
      effective_year  INTEGER NOT NULL,
      effective_month INTEGER NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 採用イベント（オーナーが登録）
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      event_date TEXT NOT NULL, -- YYYY-MM-DD
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- イベント枠の受注（社員が登録）
    CREATE TABLE IF NOT EXISTS event_orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id    INTEGER NOT NULL REFERENCES events(id),
      slots       INTEGER NOT NULL CHECK (slots > 0),
      order_year  INTEGER NOT NULL,
      order_month INTEGER NOT NULL CHECK (order_month BETWEEN 1 AND 12),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- RPO 案件（オーナーが登録）。半年 (6ヶ月) または 1年 (12ヶ月) 契約。
    CREATE TABLE IF NOT EXISTS rpo_deals (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name    TEXT NOT NULL,
      monthly_profit INTEGER NOT NULL CHECK (monthly_profit >= 0),
      start_year     INTEGER NOT NULL,
      start_month    INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
      term_months    INTEGER NOT NULL CHECK (term_months IN (6, 12)),
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- RPO 案件の担当（社員が自分で選ぶ）。
    -- 同じ担当（メイン/サブ）に複数人がつく案件もある（粗利は人数で等分して計算）。
    -- 同一人物が同じ案件を重複して担当することはできない。
    CREATE TABLE IF NOT EXISTS rpo_assignments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id    INTEGER NOT NULL REFERENCES rpo_deals(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK (role IN ('main', 'sub')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (deal_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  migrateLegacyRpoDeals(db);
  migrateAssignmentsAllowMultiRole(db);

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value);
  }

  // 招待コード: 既にユーザーがいるのに未設定の場合（旧DBからの移行時）は自動生成する。
  // 2人目以降のアカウント登録にはこのコードが必要（オーナーが設定画面で確認・変更できる）。
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0 && !getSetting(db, 'signup_code')) {
    setSetting(db, 'signup_code', generateSignupCode());
  }

  return db;
}

function generateSignupCode() {
  return require('node:crypto').randomBytes(4).toString('hex');
}

// 旧スキーマ（rpo_deals に user_id があり社員が案件を直接所有）からの移行。
// 旧 user_id はメイン担当として rpo_assignments に引き継ぐ。
function migrateLegacyRpoDeals(db) {
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('rpo_deals')")
    .all()
    .map((r) => r.name);
  if (!cols.includes('user_id')) return;

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    INSERT INTO rpo_assignments (deal_id, user_id, role)
      SELECT id, user_id, 'main' FROM rpo_deals;

    CREATE TABLE rpo_deals_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name    TEXT NOT NULL,
      monthly_profit INTEGER NOT NULL CHECK (monthly_profit >= 0),
      start_year     INTEGER NOT NULL,
      start_month    INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
      term_months    INTEGER NOT NULL CHECK (term_months IN (6, 12)),
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO rpo_deals_new (id, client_name, monthly_profit, start_year, start_month, term_months, created_at)
      SELECT id, client_name, monthly_profit, start_year, start_month, term_months, created_at FROM rpo_deals;
    DROP TABLE rpo_deals;
    ALTER TABLE rpo_deals_new RENAME TO rpo_deals;
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

// 旧スキーマ（UNIQUE(deal_id, role) で各担当1名まで）からの移行。
// 同じ担当に複数人をつけられるよう、制約を UNIQUE(deal_id, user_id) だけにして再構築する。
function migrateAssignmentsAllowMultiRole(db) {
  const uniqueIndexes = db
    .prepare("SELECT name FROM pragma_index_list('rpo_assignments') WHERE \"unique\" = 1")
    .all();
  const hasDealRoleUnique = uniqueIndexes.some((idx) => {
    const cols = db
      .prepare('SELECT name FROM pragma_index_info(?)')
      .all(idx.name)
      .map((r) => r.name);
    return cols.length === 2 && cols.includes('deal_id') && cols.includes('role');
  });
  if (!hasDealRoleUnique) return;

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE rpo_assignments_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id    INTEGER NOT NULL REFERENCES rpo_deals(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK (role IN ('main', 'sub')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (deal_id, user_id)
    );
    INSERT INTO rpo_assignments_new (id, deal_id, user_id, role, created_at)
      SELECT id, deal_id, user_id, role, created_at FROM rpo_assignments;
    DROP TABLE rpo_assignments;
    ALTER TABLE rpo_assignments_new RENAME TO rpo_assignments;
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : undefined;
}

function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// RPO 帯別パーセンテージを [tier1, tier2, tier3, tier4] で返す
function getRpoTierPercents(db) {
  return [1, 2, 3, 4].map((n) =>
    Number(getSetting(db, `rpo_tier${n}_percent`) ?? 0)
  );
}

// RPO 担当割合を { main, sub } (%) で返す
function getRpoRoleShares(db) {
  return {
    main: Number(getSetting(db, 'rpo_main_percent') ?? 0),
    sub: Number(getSetting(db, 'rpo_sub_percent') ?? 0),
  };
}

module.exports = {
  createDb,
  getSetting,
  setSetting,
  getRpoTierPercents,
  getRpoRoleShares,
  generateSignupCode,
  DEFAULT_SETTINGS,
};
