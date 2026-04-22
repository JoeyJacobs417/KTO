const storage = require('./storage');
const { id } = require('./ids');

async function list() {
  return await storage.read('contacts', []);
}

async function listActive() {
  const all = await list();
  return all.filter(c => c.active !== false);
}

async function getById(cid) {
  const all = await list();
  return all.find(c => c.id === cid) || null;
}

async function getByEmail(email) {
  if (!email) return null;
  const all = await list();
  return all.find(c => (c.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function create({ name, company, email }) {
  if (!email) throw new Error('E-mail is verplicht voor een contact.');
  const all = await list();
  const existing = all.find(c => (c.email || '').toLowerCase() === String(email).toLowerCase());
  if (existing) return existing;
  const contact = {
    id: id('c'),
    name: String(name || '').trim().slice(0, 120),
    company: String(company || '').trim().slice(0, 120),
    email: String(email).trim().slice(0, 160),
    active: true,
    createdAt: new Date().toISOString(),
  };
  all.push(contact);
  await storage.write('contacts', all);
  return contact;
}

async function update(cid, patch) {
  const all = await list();
  const i = all.findIndex(c => c.id === cid);
  if (i === -1) return null;
  const allowed = ['name', 'company', 'email', 'active'];
  for (const k of allowed) {
    if (patch[k] !== undefined) all[i][k] = patch[k];
  }
  await storage.write('contacts', all);
  return all[i];
}

async function remove(cid) {
  return await update(cid, { active: false });
}

// CSV parser — accepteert ',' of ';' als separator, met optionele quotes.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const first = lines[0];
  const sep = first.split(';').length > first.split(',').length ? ';' : ',';

  function parseLine(line) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQ = false; }
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === sep) { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(s => s.trim());
  }

  const header = parseLine(lines[0]).map(h => h.toLowerCase());
  const idx = {
    name: header.findIndex(h => /^(name|naam)$/.test(h)),
    company: header.findIndex(h => /^(company|bedrijf|organisatie)$/.test(h)),
    email: header.findIndex(h => /^(email|e-mail|mail)$/.test(h)),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row = {
      name: idx.name >= 0 ? cells[idx.name] : '',
      company: idx.company >= 0 ? cells[idx.company] : '',
      email: idx.email >= 0 ? cells[idx.email] : '',
    };
    if (row.email) rows.push(row);
  }
  return rows;
}

async function importCsv(text) {
  const rows = parseCsv(text);
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.email) { skipped++; continue; }
    const existing = await getByEmail(row.email);
    if (existing) { skipped++; continue; }
    await create(row);
    created++;
  }
  return { created, skipped, total: rows.length };
}

module.exports = { list, listActive, getById, getByEmail, create, update, remove, importCsv };
