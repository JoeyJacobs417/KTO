// Lichtgewicht cookie-auth: HMAC-signed token, geen externe lib nodig.
const crypto = require('crypto');

const COOKIE_NAME = 'survey_admin';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 uur

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET ontbreekt of is te kort (min 16 chars).');
  }
  return s;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function createToken(username) {
  const payload = `${username}.${Date.now()}`;
  const sig = sign(payload);
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  let payload;
  try {
    payload = Buffer.from(parts[0], 'base64url').toString('utf8');
  } catch { return null; }
  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) return null;
  const [username, tsStr] = payload.split('.');
  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return null;
  if ((Date.now() - ts) / 1000 > MAX_AGE_SECONDS) return null;
  return { username };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx === -1) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setAuthCookie(res, token) {
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  return !!verifyToken(token);
}

module.exports = {
  createToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  isAuthenticated,
  parseCookies,
  COOKIE_NAME,
};
