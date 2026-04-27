// Cron endpoint — dagelijks aangeroepen.
// Verstuurt: (1) auto-uitnodigingen aan contacten die "due" zijn, (2) reminders.
const campaign = require('../lib/campaign');
const settings = require('../lib/settings');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, 'http://localhost');
  const provided = url.searchParams.get('secret') ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'CRON_SECRET niet geconfigureerd.' }));
  }
  if (provided !== expected) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  const result = { ok: true };

  // 1) Auto-uitnodigingen op basis van per-contact schema
  try {
    const s = await settings.get();
    if (!s.autoEnabled) {
      result.autoRound = { triggered: false, reason: 'auto_disabled' };
    } else {
      const due = await campaign.dueContacts();
      if (due.length === 0) {
        result.autoRound = { triggered: false, reason: 'no_due_contacts' };
      } else {
        const round = await campaign.startRound({
          triggeredBy: 'auto',
          contactIds: due.map(c => c.id),
          sendEmail: true,
        });
        result.autoRound = round;
      }
    }
  } catch (e) {
    result.autoRound = { error: String(e) };
  }

  // 2) Reminders
  try {
    result.reminders = await campaign.processReminders();
  } catch (e) {
    result.reminders = { error: String(e) };
  }

  res.statusCode = 200;
  res.end(JSON.stringify(result));
};
