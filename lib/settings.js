const storage = require('./storage');

const DEFAULTS = {
  autoEnabled: false,
  intervalDays: 90,
  lastRoundAt: null,
  reminderEnabled: false,
  reminderAfterDays: 3,
};

async function get() {
  const s = await storage.read('settings', DEFAULTS);
  return { ...DEFAULTS, ...s };
}

async function set(patch) {
  const cur = await get();
  const next = { ...cur, ...patch };
  if (next.intervalDays != null) {
    next.intervalDays = Math.max(1, Math.min(3650, Number(next.intervalDays) || 90));
  }
  if (next.reminderAfterDays != null) {
    next.reminderAfterDays = Math.max(1, Math.min(60, Number(next.reminderAfterDays) || 3));
  }
  await storage.write('settings', next);
  return next;
}

module.exports = { get, set };
