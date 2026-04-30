const storage = require('./storage');

// Settings zijn namespaced per type ('klant' / 'medewerker').
// Voor backward compat: bestaande top-level keys worden gemigreerd naar 'klant.*'.

const TYPE_DEFAULTS = {
  klant: {
    autoEnabled: false,
    intervalDays: 90,
    lastRoundAt: null,
    reminderEnabled: false,
    reminderAfterDays: 3,
    reminderMaxCount: 1,
    submissionRecipients: ['jzahi@machine-learning.company'],
    detractorRecipients: ['jzahi@machine-learning.company', 'jjacobs@machine-learning.company'],
  },
  medewerker: {
    autoEnabled: false,
    intervalDays: 90,
    lastRoundAt: null,
    reminderEnabled: false,
    reminderAfterDays: 3,
    reminderMaxCount: 1,
    submissionRecipients: ['jjacobs@machine-learning.company'],
    detractorRecipients: ['jjacobs@machine-learning.company'],
  },
};

function defaultsFor(type) {
  return TYPE_DEFAULTS[type === 'medewerker' ? 'medewerker' : 'klant'];
}

async function getRaw() {
  return await storage.read('settings', {});
}

async function get(type = 'klant') {
  const raw = await getRaw();
  const t = type === 'medewerker' ? 'medewerker' : 'klant';
  const defaults = defaultsFor(t);
  const ns = raw[t] || {};

  if (t === 'medewerker') {
    return { ...defaults, ...ns };
  }

  // Klant: combineer top-level legacy keys + nieuwe namespace
  const legacy = {};
  for (const k of Object.keys(defaults)) {
    if (raw[k] !== undefined) legacy[k] = raw[k];
  }
  return { ...defaults, ...legacy, ...ns };
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
  if (next.reminderMaxCount != null) {
    next.reminderMaxCount = Math.max(1, Math.min(5, Math.round(Number(next.reminderMaxCount) || 1)));
  }
  if (next.submissionRecipients != null) {
    next.submissionRecipients = Array.isArray(next.submissionRecipients) ? next.submissionRecipients : [];
  }
  if (next.detractorRecipients != null) {
    next.detractorRecipients = Array.isArray(next.detractorRecipients) ? next.detractorRecipients : [];
  }
  raw[ns] = next;
  await storage.write('settings', raw);
  return next;
}

module.exports = { get, set };
