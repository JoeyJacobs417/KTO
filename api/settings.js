const { isAuthenticated } = require('../lib/auth');
const settings = require('../lib/settings');

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
      const patch = {};
      if (body.autoEnabled !== undefined) patch.autoEnabled = Boolean(body.autoEnabled);
      if (body.intervalDays !== undefined) patch.intervalDays = Number(body.intervalDays);
      if (body.reminderEnabled !== undefined) patch.reminderEnabled = Boolean(body.reminderEnabled);
      if (body.reminderAfterDays !== undefined) patch.reminderAfterDays = Number(body.reminderAfterDays);
      const next = await settings.set(patch);
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
