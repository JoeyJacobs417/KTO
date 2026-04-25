const { isAuthenticated } = require('../lib/auth');
const rounds = require('../lib/rounds');
const contacts = require('../lib/contacts');
const campaign = require('../lib/campaign');

function baseUrl() {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return '';
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const allRounds = await rounds.listRounds();
    const allInvitations = await rounds.listInvitations();
    const allContacts = await contacts.list();
    const contactsById = Object.fromEntries(allContacts.map(c => [c.id, c]));
    const url = baseUrl();

    const enriched = allRounds.map(r => {
      const invs = allInvitations.filter(i => i.roundId === r.id);
      const responded = invs.filter(i => i.respondedAt).length;
      const sent = invs.filter(i => i.sentAt).length;

      const invitationDetails = invs.map(i => {
        const c = contactsById[i.contactId];
        return {
          id: i.id,
          token: i.token,
          link: url ? `${url}/?t=${i.token}` : `/?t=${i.token}`,
          contactId: i.contactId,
          contactName: c ? c.name : null,
          contactCompany: c ? c.company : null,
          contactEmail: c ? c.email : null,
          sentAt: i.sentAt,
          respondedAt: i.respondedAt,
        };
      });

      return {
        ...r,
        total: invs.length,
        sent,
        responded,
        responseRate: invs.length ? Math.round((responded / invs.length) * 100) : 0,
        invitations: invitationDetails,
      };
    }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    res.statusCode = 200;
    return res.end(JSON.stringify({ rounds: enriched }));
  }

  if (req.method === 'POST') {
    try {
      const result = await campaign.startRound({ triggeredBy: 'manual' });
      if (!result.round) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: result.error || 'Kan ronde niet starten.' }));
      }
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: String(e) }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
