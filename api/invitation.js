// Publiek endpoint: GET /api/invitation?t=<token>
const rounds = require('../lib/rounds');
const contacts = require('../lib/contacts');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const tok = url.searchParams.get('t');
  if (!tok) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Token ontbreekt' }));
  }

  const inv = await rounds.getInvitationByToken(tok);
  if (!inv) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Ongeldige of verlopen link.' }));
  }

  const contact = await contacts.getById(inv.contactId);
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    alreadyResponded: !!inv.respondedAt,
    contact: contact ? { name: contact.name, company: contact.company, email: contact.email } : null,
  }));
};
