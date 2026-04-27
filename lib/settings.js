const storage = require('./storage');

// Settings zijn namespaced per type ('klant' / 'medewerker').
// Voor backward compat: bestaande top-level keys worden gemigreerd naar 'klant.*'.

const TYPE_DEFAULTS = {
  autoEnabled: false,
  intervalDays: 90,
  lastRoundAt: null,
  reminderEnabled: false,
  reminderAfterDays: 3,
};

async function getRaw() {
  return await storage.read('settings', {});
}

async function get(type = 'klant') {
  const raw = await getRaw();
  // Migratie: oude top-level instellingen → klant-namespace
  const klantNs = raw.klant || {};
  const medewerkerNs = raw.medewerker || {};

  if (type === 'medewerker') {
    return { ...TYPE_DEFAULTS, ...medewerkerNs };
  }

  // Klant: combineer top-level legacy keys + nieuwe namespace
  const legacy = {};
  for (const k of Object.keys(TYPE_DEFAULTS)) {
    if (raw[k] !== undefined) legacy[k] = raw[k];
  }
  return { ...TYPE_DEFAULTS, ...legacy, ...klantNs };
}

async function set(patch, type = 'klant') {
  const raw = await getRaw();
  const ns = type === 'medewerker' ? 'medewerker' : 'klant';
  const current = await get(ns);
  const next = { ...current, ...patch };
  if (next.intervalDays != null) {
    next.intervalDays = Math.max(1, Math.min(3650, Number(next.intervalDays) || 90));
  }
  if (next.reminderAfterDays != null) {
    next.reminderAfterDays = Math.max(1, Math.min(60, Number(next.reminderAfterDays) || 3));
  }
  raw[ns] = next;
  await storage.write('settings', raw);
  return next;
}

module.exports = { get, set };
