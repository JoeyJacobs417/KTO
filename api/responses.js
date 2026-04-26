const { isAuthenticated } = require('../lib/auth');
const storage = require('../lib/storage');
const contactsLib = require('../lib/contacts');
const roundsLib = require('../lib/rounds');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 50_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function computeStats(entries) {
  const counted = entries.filter(e => !e.excluded);
  const n = counted.length;
  if (n === 0) {
    return {
      count: 0, avgOverall: null, nps: null,
      promoters: 0, passives: 0, detractors: 0,
      promotersPct: 0, passivesPct: 0, detractorsPct: 0,
    };
  }
  let sum = 0, promoters = 0, passives = 0, detractors = 0;
  for (const e of counted) {
    const score = Number((e.answers || {}).q1_overall) || 0;
    sum += score;
    if (score >= 9) promoters++;
    else if (score >= 7) passives++;
    else detractors++;
  }
  const avg = Math.round((sum / n) * 100) / 100;
  const nps = Math.round(((promoters - detractors) / n) * 100);
  return {
    count: n,
    avgOverall: avg,
    nps,
    promoters, passives, detractors,
    promotersPct: Math.round((promoters / n) * 100),
    passivesPct: Math.round((passives / n) * 100),
    detractorsPct: Math.round((detractors / n) * 100),
  };
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function buildCsv(responses) {
  const headers = [
    'Datum', 'Naam', 'Bedrijf', 'E-mail', 'Account manager',
    'Cijfer', 'Waardeert', 'Verbeteren', 'AI-kansen', 'Ronde-id', 'Uitgesloten',
  ];
  const rows = responses.map(e => {
    const a = e.answers || {};
    const c = e.contact || {};
    const date = new Date(e.createdAt).toLocaleString('nl-NL');
    return [
      date,
      c.name || a.name || '',
      c.company || a.company || '',
      c.email || a.email || '',
      c.accountManager || '',
      a.q1_overall != null ? a.q1_overall : '',
      a.q6_likes || '',
      a.q7_improve || '',
      a.q4_ai_opportunities || '',
      e.roundId || '',
      e.excluded ? 'ja' : 'nee',
    ].map(csvEscape).join(';');
  });
  return '\uFEFF' + headers.map(csvEscape).join(';') + '\n' + rows.join('\n');
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  const format = url.searchParams.get('format');

  if (req.method === 'PATCH') {
    if (!id) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'id ontbreekt' }));
    }
    let body;
    try { body = await readJson(req); }
    catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    const all = await storage.readAll();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Niet gevonden' }));
    }
    if (body.excluded !== undefined) {
      all[idx].excluded = Boolean(body.excluded);
    }
    await storage.write('responses', all);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, response: all[idx] }));
  }

  if (req.method === 'DELETE') {
    if (!id) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'id ontbreekt' }));
    }
    const all = await storage.readAll();
    const target = all.find(e => e.id === id);
    if (!target) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Niet gevonden' }));
    }
    const remaining = all.filter(e => e.id !== id);
    await storage.write('responses', remaining);

    if (target.invitationId) {
      const invitations = await roundsLib.listInvitations();
      const inv = invitations.find(i => i.id === target.invitationId);
      if (inv) {
        inv.respondedAt = null;
        inv.responseId = null;
        await storage.write('invitations', invitations);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
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
        excluded: !!e.excluded,
        contact: c ? {
          id: c.id, name: c.name, company: c.company, email: c.email,
          accountManager: c.accountManager || '',
        } : null,
      };
    });

  if (format === 'csv') {
    const csv = buildCsv(enriched);
    const filename = `klanttevredenheid-${new Date().toISOString().slice(0, 10)}.csv`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.end(csv);
  }

  const stats = computeStats(all);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ stats, responses: enriched }));
};
