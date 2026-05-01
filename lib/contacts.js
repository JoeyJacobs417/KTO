const storage = require('./storage');
const { id } = require('./ids');

// Een contact heeft een 'type': "klant" (default) of "medewerker".

async function list(type = null) {
  const all = await storage.read('contacts', []);
  if (!type) return all;
  return all.filter(c => (c.type || 'klant') === type);
}

async function listActive(type = null) {
  const all = await list(type);
  return all.filter(c => c.active !== false && !c.optOut && !c.bounced);
}

async function getById(cid) {
  const all = await storage.read('contacts', []);
  return all.find(c => c.id === cid) || null;
}

async function getByEmail(email, type = null) {
  if (!email) return null;
  const all = await list(type);
  return all.find(c => (c.email || '').toLowerCase() === email.toLowerCase()) || null;
}

function normalizeLanguage(v) {
  return v === 'en' ? 'en' : 'nl';
}

async function create({ name, company, email, accountManager, language, type = 'klant' }) {
  if (!email) throw new Error('E-mail is verplicht voor een contact.');
  const all = await storage.read('contacts', []);
  const t = type === 'medewerker' ? 'medewerker' : 'klant';
  const emailLower = String(email).trim().toLowerCase();
  const existing = all.find(c => (c.email || '').toLowerCase() === emailLower);
  if (existing) {
    const existingType = existing.type || 'klant';
    const existingList = existingType === 'medewerker' ? 'medewerkerslijst' : 'klantenlijst';
    if (existingType === t) {
      throw new Error(`Dit e-mailadres staat al in je ${existingList}.`);
    }
    throw new Error(`Dit e-mailadres staat al in je ${existingList}. Een e-mailadres kan maar in één lijst voorkomen.`);
  }
  const contact = {
    id: id('c'),
    type: t,
    name: String(name || '').trim().slice(0, 120),
    company: String(company || '').trim().slice(0, 120),
    email: String(email).trim().slice(0, 160),
    accountManager: t === 'klant' ? String(accountManager || '').trim().slice(0, 120) : '',
    language: t === 'klant' ? normalizeLanguage(language) : 'nl',
    active: true,
    optOut: false,
    bounced: false,
    intervalDaysOverride: null,
    lastInvitedAt: null,
    createdAt: new Date().toISOString(),
  };
  all.push(contact);
  await storage.write('contacts', all);
  return contact;
}

async function update(cid, patch) {
  const all = await storage.read('contacts', []);
  const i = all.findIndex(c => c.id === cid);
  if (i === -1) return null;
  const allowed = [
    'name', 'company', 'email', 'active',
    'accountManager', 'optOut', 'bounced',
    'intervalDaysOverride', 'lastInvitedAt', 'lastRespondedAt',
    'language',
  ];
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      if (k === 'language') {
        if ((all[i].type || 'klant') === 'klant') all[i].language = normalizeLanguage(patch.language);
      } else {
        all[i][k] = patch[k];
      }
    }
  }
  await storage.write('contacts', all);
  return all[i];
}

async function remove(cid) {
  return await update(cid, { active: false });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const first = lines[0];
  const sep = first.split(';').length > first.split(',').length ? ';' : ',';
  function parseLine(line) {
    const cells = []; let cur = ''; let inQ = false;
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
    accountManager: header.findIndex(h => /^(accountmanager|account[\s_-]?manager|am|accounthouder)$/.test(h)),
    language: header.findIndex(h => /^(language|taal|lang)$/.test(h)),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row = {
      name: idx.name >= 0 ? cells[idx.name] : '',
      company: idx.company >= 0 ? cells[idx.company] : '',
      email: idx.email >= 0 ? cells[idx.email] : '',
      accountManager: idx.accountManager >= 0 ? cells[idx.accountManager] : '',
      language: idx.language >= 0 ? cells[idx.language] : '',
    };
    if (row.email) rows.push(row);
  }
  return rows;
}

async function importCsv(text, type = 'klant') {
  const rows = parseCsv(text);
  const all = await storage.read('contacts', []);
  const existingEmails = new Set(
    all.map(c => (c.email || '').toLowerCase()).filter(Boolean)
  );
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.email) { skipped++; continue; }
    const key = String(row.email).trim().toLowerCase();
    if (existingEmails.has(key)) { skipped++; continue; }
    try {
      await create({ ...row, type });
      existingEmails.add(key);
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, skipped, total: rows.length };
}

module.exports = { list, listActive, getById, getByEmail, create, update, remove, importCsv };
