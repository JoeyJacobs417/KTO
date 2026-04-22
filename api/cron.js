// Cron endpoint — wordt aangeroepen door Vercel Cron.
// Beveiligd via CRON_SECRET (Vercel stuurt die mee als Authorization: Bearer header).
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

  if (!(await campaign.dueForAutoRound())) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, triggered: false, reason: 'not_due' }));
  }

  try {
    const result = await campaign.startRound({ triggeredBy: 'auto' });
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, triggered: true, ...result }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: String(e) }));
  }
};
