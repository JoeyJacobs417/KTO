// Lokale dev-server. Run met: node local-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
} catch {}

const submit = require('./api/submit');
const login = require('./api/login');
const responses = require('./api/responses');
const contacts = require('./api/contacts');
const rounds = require('./api/rounds');
const settings = require('./api/settings');
const emailTemplatesApi = require('./api/email-templates');
const cron = require('./api/cron');
const invitation = require('./api/invitation');
const optout = require('./api/optout');
const resendWebhook = require('./api/resend-webhook');
const audit = require('./api/audit');
const campaign = require('./lib/campaign');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/admin') urlPath = '/admin.html';
  if (urlPath === '/admin/login') urlPath = '/admin-login.html';
  if (urlPath === '/bedankt') urlPath = '/thanks.html';
  if (urlPath === '/medewerker') urlPath = '/medewerker.html';

  const filePath = path.join(__dirname, 'public', urlPath);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.statusCode = 403; return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/submit')) return submit(req, res);
    if (req.url.startsWith('/api/login')) return login(req, res);
    if (req.url.startsWith('/api/responses')) return responses(req, res);
    if (req.url.startsWith('/api/contacts')) return contacts(req, res);
    if (req.url.startsWith('/api/rounds')) return rounds(req, res);
    if (req.url.startsWith('/api/settings')) return settings(req, res);
    if (req.url.startsWith('/api/email-templates')) return emailTemplatesApi(req, res);
    if (req.url.startsWith('/api/cron')) return cron(req, res);
    if (req.url.startsWith('/api/invitation')) return invitation(req, res);
    if (req.url.startsWith('/api/optout')) return optout(req, res);
    if (req.url.startsWith('/api/resend-webhook')) return resendWebhook(req, res);
    if (req.url.startsWith('/api/audit')) return audit(req, res);
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

setInterval(async () => {
  try {
    for (const type of ['klant', 'medewerker']) {
      if (await campaign.dueForAutoRound(type)) {
        const due = await campaign.dueContacts(type);
        if (due.length > 0) {
          console.log(`[scheduler] auto-ronde (${type}) starten voor ${due.length} contacten`);
          await campaign.startRound({ triggeredBy: 'auto', contactIds: due.map(c => c.id), type });
        }
      }
    }
    const r = await campaign.processReminders();
    if (r.sent > 0) console.log('[scheduler] reminders verstuurd:', r);
  } catch (e) { console.error('[scheduler] fout:', e); }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Survey app:           http://localhost:${PORT}/`);
  console.log(`Medewerker survey:    http://localhost:${PORT}/medewerker`);
  console.log(`Admin login:          http://localhost:${PORT}/admin/login`);
});
