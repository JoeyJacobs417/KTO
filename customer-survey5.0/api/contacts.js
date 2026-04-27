const { isAuthenticated } = require('../lib/auth');
const contacts = require('../lib/contacts');
const audit = require('../lib/audit');

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

function contactLabel(c) {
  if (!c) return '';
  const parts = [c.name, c.company].filter(Boolean);
  if (parts.length) return parts.join(' — ');
  return c.email || c.id || '';
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }

  res.setHeader('Content-Type', 'application/json');
  const actor = audit.getActor(req);
  const ip = audit.getIp(req);

  if (req.url.includes('/import')) {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
    try {
      const text = await readRaw(req);
      const result = await contacts.importCsv(text);
      try {
        await audit.log({
          actor, ip, action: 'contact.import',
          details: { created: result.created, skipped: result.skipped, total: result.total },
        });
      } catch (e) { console.error('Audit error:', e); }
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
      try {
        await audit.log({
          actor, ip, action: 'contact.create',
          targetType: 'contact', targetId: c.id, targetLabel: contactLabel(c),
          details: { email: c.email, accountManager: c.accountManager || '' },
        });
      } catch (e) { console.error('Audit error:', e); }
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
      const before = await contacts.getById(contactId);
      const c = await contacts.update(contactId, body);
      if (!c) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Niet gevonden' })); }
      let action = 'contact.update';
      if (body.active !== undefined && before && body.active !== before.active) {
        action = body.active ? 'contact.activate' : 'contact.deactivate';
      } else if (body.accountManager !== undefined) {
        action = 'contact.account_manager';
      }
      try {
        await audit.log({
          actor, ip, action,
          targetType: 'contact', targetId: c.id, targetLabel: contactLabel(c),
          details: body,
        });
      } catch (e) { console.error('Audit error:', e); }
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, contact: c }));
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  if (req.method === 'DELETE' && contactId) {
    const before = await contacts.getById(contactId);
    const c = await contacts.remove(contactId);
    if (!c) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Niet gevonden' })); }
    try {
      await audit.log({
        actor, ip, action: 'contact.deactivate',
        targetType: 'contact', targetId: c.id, targetLabel: contactLabel(c),
      });
    } catch (e) { console.error('Audit error:', e); }
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, contact: c }));
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
