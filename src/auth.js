'use strict';

const crypto = require('node:crypto');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日
const COOKIE_NAME = 'voco_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now() + SESSION_TTL_MS
  );
  return token;
}

function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

// req.user / req.sessionToken を設定するミドルウェア
function sessionMiddleware(db) {
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) {
      const row = db
        .prepare(
          `SELECT s.token, s.expires_at, u.id, u.email, u.name, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token = ?`
        )
        .get(token);
      if (row && row.expires_at > Date.now()) {
        req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
        req.sessionToken = token;
      } else if (row) {
        destroySession(db, token);
      }
    }
    next();
  };
}

// HTTPS 経由（本番デプロイ時）のリクエストでは Secure フラグを付ける
function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req, res, token) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'ログインが必要です' });
  next();
}

function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'ログインが必要です' });
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'オーナー権限が必要です' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  sessionMiddleware,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireOwner,
};
