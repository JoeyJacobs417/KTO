const { isAuthenticated } = require('../lib/auth');
const contacts = require('../lib/contacts');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }

  res.setHeader('Content-Type', 'application/json');

  // /api/contacts/import
  if (req.url.includes('/import')) {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
    try {
      const text = await readRaw(req);
      const result = await contacts.importCsv(text);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'CSV kon niet verwerkt worden.' }));
    }
  }

  const url = new URL(req.url, 'http://localhost');
  const contactId = url.searchParams.get('id');

  if (req.method === 'GET') {
    const list = await contacts.list();
    res.statusCode = 200;
    return res.end(JSON.stringify({ contacts: list }));
  }

  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (!body.email) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'E-mail is verplicht.' })); }
      const c = await contacts.create(body);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, contact: c }));
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message || 'Kan contact niet toevoegen.' }));
    }
  }

  if (req.method === 'PUT' && contactId) {
    try {
      const body = await readJson(req);
      const c = await contacts.update(contactId, body);
      if (!c) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Niet gevonden' })); }
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, contact: c }));
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  if (req.method === 'DELETE' && contactId) {
    const c = await contacts.remove(contactId);
    if (!c) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Niet gevonden' })); }
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, contact: c }));
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
