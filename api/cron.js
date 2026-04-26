// Cron endpoint — wordt aangeroepen door Vercel Cron.
// Doet twee dingen:
//   1) Auto-ronde starten als die "due" is
//   2) Reminders versturen voor non-responders (ongeacht auto-ronde)
const campaign = require('../lib/campaign');

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

  // 1) Auto-ronde
  try {
    if (await campaign.dueForAutoRound()) {
      result.autoRound = await campaign.startRound({ triggeredBy: 'auto' });
    } else {
      result.autoRound = { triggered: false, reason: 'not_due' };
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
