// Cron: dagelijks. Verwerkt auto-rondes en reminders voor BEIDE types.
const campaign = require('../lib/campaign');
const settings = require('../lib/settings');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://localhost');
  const provided = url.searchParams.get('secret') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;
  if (!expected) { res.statusCode = 500; return res.end(JSON.stringify({ error: 'CRON_SECRET niet geconfigureerd.' })); }
  if (provided !== expected) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Unauthorized' })); }

  const result = { ok: true, klant: {}, medewerker: {} };

  for (const type of ['klant', 'medewerker']) {
    try {
      const s = await settings.get(type);
      if (!s.autoEnabled) {
        result[type].autoRound = { triggered: false, reason: 'auto_disabled' };
      } else {
        const due = await campaign.dueContacts(type);
        if (due.length === 0) {
          result[type].autoRound = { triggered: false, reason: 'no_due_contacts' };
        } else {
          result[type].autoRound = await campaign.startRound({ triggeredBy: 'auto', contactIds: due.map(c => c.id), sendEmail: true, type });
        }
      }
    } catch (e) { result[type].autoRound = { error: String(e) }; }
  }

  try { result.reminders = await campaign.processReminders(); }
  catch (e) { result.reminders = { error: String(e) }; }

  res.statusCode = 200;
  res.end(JSON.stringify(result));
};
