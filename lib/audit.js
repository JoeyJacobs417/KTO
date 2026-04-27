// Audit log — registreert admin- en systeem-acties.
const storage = require('./storage');
const { id } = require('./ids');
const { parseCookies, verifyToken, COOKIE_NAME } = require('./auth');

const MAX_ENTRIES = 5000; // bovengrens om groei te beperken

async function log(entry) {
  const logs = await storage.read('audit', []);
  const record = {
    id: id('log'),
    timestamp: new Date().toISOString(),
    actor: entry.actor || 'system',
    action: entry.action,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    targetLabel: entry.targetLabel || null,
    details: entry.details || null,
    ip: entry.ip || null,
  };
  logs.push(record);
  // Trim oude entries
  const trimmed = logs.length > MAX_ENTRIES ? logs.slice(-MAX_ENTRIES) : logs;
  await storage.write('audit', trimmed);
  return record;
}

async function list() {
  return await storage.read('audit', []);
}

function getActor(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return 'public';
  const decoded = verifyToken(token);
  return decoded ? decoded.username : 'public';
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || null;
}

module.exports = { log, list, getActor, getIp };
