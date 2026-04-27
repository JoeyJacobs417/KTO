// Webhook endpoint voor Resend bounce-events.
const contacts = require('../lib/contacts');
const audit = require('../lib/audit');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const provided = url.searchParams.get('secret') ||
    (req.headers['x-webhook-secret']) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.RESEND_WEBHOOK_SECRET;

  if (!expected) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'RESEND_WEBHOOK_SECRET niet geconfigureerd.' }));
  }
  if (provided !== expected) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  let body;
  try { body = await readJson(req); }
  catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid JSON' }));
  }

  const eventType = body.type || body.event || '';
  if (eventType !== 'email.bounced') {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ignored: eventType || 'unknown' }));
  }

  const data = body.data || {};
  const bounce = data.bounce || {};
  const isHard = (bounce.type === 'hard') ||
                 (bounce.subType === 'permanent') ||
                 ((bounce.message || '').toLowerCase().includes('does not exist'));

  if (!isHard) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ignored: 'soft_bounce', bounceType: bounce.type }));
  }

  const recipients = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
  let deactivated = 0;
  const details = [];
  for (const email of recipients) {
    const contact = await contacts.getByEmail(email);
    if (!contact) continue;
    await contacts.update(contact.id, { active: false, bounced: true });
    deactivated++;
    details.push({ id: contact.id, email });
    try {
      await audit.log({
        actor: 'system',
        action: 'contact.bounced',
        targetType: 'contact',
        targetId: contact.id,
        targetLabel: ([contact.name, contact.company].filter(Boolean).join(' — ') || email),
        details: { email, bounceType: bounce.type, message: bounce.message },
      });
    } catch (e) { console.error('Audit error:', e); }
    console.log(`[bounce] auto-deactivated contact ${contact.id} (${email})`);
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, deactivated, details }));
};
