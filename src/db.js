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

    -- RPO 案件（社員が登録）。半年 (6ヶ月) または 1年 (12ヶ月) 契約。
    CREATE TABLE IF NOT EXISTS rpo_deals (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_name    TEXT NOT NULL,
      monthly_profit INTEGER NOT NULL CHECK (monthly_profit >= 0),
      start_year     INTEGER NOT NULL,
      start_month    INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
      term_months    INTEGER NOT NULL CHECK (term_months IN (6, 12)),
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value);
  }

  return db;
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

module.exports = { createDb, getSetting, setSetting, getRpoTierPercents, DEFAULT_SETTINGS };
