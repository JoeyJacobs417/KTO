const { createToken, setAuthCookie, clearAuthCookie } = require('../lib/auth');
const crypto = require('crypto');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    clearAuthCookie(res);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : await readJson(req);
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid JSON' }));
  }

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Server niet geconfigureerd (ADMIN_USERNAME / ADMIN_PASSWORD ontbreekt).' }));
  }

  const u = String(body.username || '');
  const p = String(body.password || '');

  if (!safeEqual(u, expectedUser) || !safeEqual(p, expectedPass)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Onjuiste gebruikersnaam of wachtwoord.' }));
  }

  try {
    const token = createToken(u);
    setAuthCookie(res, token);
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: e.message }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
};
