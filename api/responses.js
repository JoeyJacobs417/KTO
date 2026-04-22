const { isAuthenticated } = require('../lib/auth');
const storage = require('../lib/storage');
const contactsLib = require('../lib/contacts');

function computeStats(entries) {
  const n = entries.length;
  if (n === 0) return { count: 0, avgOverall: null };
  let sum = 0;
  for (const e of entries) sum += Number((e.answers || {}).q1_overall) || 0;
  return { count: n, avgOverall: Math.round((sum / n) * 100) / 100 };
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }

  const all = await storage.readAll();
  const allContacts = await contactsLib.list();
  const contactsById = Object.fromEntries(allContacts.map(c => [c.id, c]));

  const enriched = [...all]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(e => {
      const c = e.contactId ? contactsById[e.contactId] : null;
      return {
        ...e,
        contact: c ? { id: c.id, name: c.name, company: c.company, email: c.email } : null,
      };
    });

  const stats = computeStats(all);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ stats, responses: enriched }));
};
