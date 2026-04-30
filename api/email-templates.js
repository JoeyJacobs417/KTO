const { isAuthenticated } = require('../lib/auth');
const templates = require('../lib/emailTemplates');
const audit = require('../lib/audit');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 100_000) req.destroy(); });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const all = await templates.getAll();
    res.statusCode = 200;
    return res.end(JSON.stringify({ templates: all }));
  }

  if (req.method === 'PUT') {
    try {
      const body = await readJson(req);
      const type = body.type;
      const kind = body.kind;
      const lang = body.lang || body.language || 'nl';
      if (!templates.TYPES.includes(type)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Ongeldig type' }));
      }
      if (!templates.KINDS.includes(kind)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Ongeldige soort' }));
      }
      const validLangs = templates.LANGS_FOR_TYPE[type] || ['nl'];
      if (!validLangs.includes(lang)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Ongeldige taal voor dit type' }));
      }
      const subject = String(body.subject == null ? '' : body.subject).slice(0, 300);
      const bodyText = String(body.body == null ? '' : body.body).slice(0, 20000);
      const saved = await templates.setOne(type, kind, lang, { subject, body: bodyText });
      try {
        await audit.log({
          actor: audit.getActor(req), ip: audit.getIp(req),
          action: 'email_template.update',
          targetType: 'email_template',
          targetLabel: `${type} — ${kind} (${lang})`,
          details: { type, kind, lang },
        });
      } catch {}
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, template: saved }));
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
