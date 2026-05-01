const { isAuthenticated } = require('../lib/auth');
const settings = require('../lib/settings');
const audit = require('../lib/audit');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 20_000) req.destroy(); });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function parseRecipients(input) {
  if (input == null) return null;
  let raw;
  if (Array.isArray(input)) raw = input;
  else if (typeof input === 'string') raw = input.split(/[\s,;\n]+/);
  else return null;
  return raw
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    .slice(0, 50);
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type') === 'medewerker' ? 'medewerker' : 'klant';

  if (req.method === 'GET') {
    const s = await settings.get(type);
    res.statusCode = 200;
    return res.end(JSON.stringify({ settings: s }));
  }

  if (req.method === 'PUT') {
    try {
      const body = await readJson(req);
      const before = await settings.get(type);
      const patch = {}; const changed = {};
      if (body.autoEnabled !== undefined) { patch.autoEnabled = Boolean(body.autoEnabled); if (patch.autoEnabled !== before.autoEnabled) changed.autoEnabled = patch.autoEnabled; }
      if (body.intervalDays !== undefined) { patch.intervalDays = Number(body.intervalDays); if (patch.intervalDays !== before.intervalDays) changed.intervalDays = patch.intervalDays; }
      if (body.reminderEnabled !== undefined) { patch.reminderEnabled = Boolean(body.reminderEnabled); if (patch.reminderEnabled !== before.reminderEnabled) changed.reminderEnabled = patch.reminderEnabled; }
      if (body.reminderAfterDays !== undefined) { patch.reminderAfterDays = Number(body.reminderAfterDays); if (patch.reminderAfterDays !== before.reminderAfterDays) changed.reminderAfterDays = patch.reminderAfterDays; }
      if (body.reminderMaxCount !== undefined) { patch.reminderMaxCount = Number(body.reminderMaxCount); if (patch.reminderMaxCount !== before.reminderMaxCount) changed.reminderMaxCount = patch.reminderMaxCount; }
      if (body.submissionRecipients !== undefined) {
        const r = parseRecipients(body.submissionRecipients);
        if (r != null) {
          patch.submissionRecipients = r;
          if (JSON.stringify(r) !== JSON.stringify(before.submissionRecipients)) changed.submissionRecipients = r;
        }
      }
      if (body.detractorRecipients !== undefined) {
        const r = parseRecipients(body.detractorRecipients);
        if (r != null) {
          patch.detractorRecipients = r;
          if (JSON.stringify(r) !== JSON.stringify(before.detractorRecipients)) changed.detractorRecipients = r;
        }
      }
      if (body.promoterRecipients !== undefined) {
        const r = parseRecipients(body.promoterRecipients);
        if (r != null) {
          patch.promoterRecipients = r;
          if (JSON.stringify(r) !== JSON.stringify(before.promoterRecipients)) changed.promoterRecipients = r;
        }
      }
      const next = await settings.set(patch, type);
      if (Object.keys(changed).length > 0) {
        try { await audit.log({ actor: audit.getActor(req), ip: audit.getIp(req), action: 'settings.update', details: { type, ...changed } }); } catch {}
      }
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, settings: next }));
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
