const { isAuthenticated } = require('../lib/auth');
const settings = require('../lib/settings');
const audit = require('../lib/audit');

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

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const s = await settings.get();
    res.statusCode = 200;
    return res.end(JSON.stringify({ settings: s }));
  }

  if (req.method === 'PUT') {
    try {
      const body = await readJson(req);
      const before = await settings.get();
      const patch = {};
      const changed = {};
      if (body.autoEnabled !== undefined) {
        patch.autoEnabled = Boolean(body.autoEnabled);
        if (patch.autoEnabled !== before.autoEnabled) changed.autoEnabled = patch.autoEnabled;
      }
      if (body.intervalDays !== undefined) {
        patch.intervalDays = Number(body.intervalDays);
        if (patch.intervalDays !== before.intervalDays) changed.intervalDays = patch.intervalDays;
      }
      if (body.reminderEnabled !== undefined) {
        patch.reminderEnabled = Boolean(body.reminderEnabled);
        if (patch.reminderEnabled !== before.reminderEnabled) changed.reminderEnabled = patch.reminderEnabled;
      }
      if (body.reminderAfterDays !== undefined) {
        patch.reminderAfterDays = Number(body.reminderAfterDays);
        if (patch.reminderAfterDays !== before.reminderAfterDays) changed.reminderAfterDays = patch.reminderAfterDays;
      }
      const next = await settings.set(patch);
      if (Object.keys(changed).length > 0) {
        try {
          await audit.log({
            actor: audit.getActor(req),
            ip: audit.getIp(req),
            action: 'settings.update',
            details: changed,
          });
        } catch (e) { console.error('Audit error:', e); }
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
