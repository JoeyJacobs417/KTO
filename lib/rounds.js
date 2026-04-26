const storage = require('./storage');
const { id, token } = require('./ids');

const EXPIRY_DAYS = 30;

async function listRounds() {
  return await storage.read('rounds', []);
}

async function listInvitations() {
  return await storage.read('invitations', []);
}

async function getInvitationByToken(tok) {
  const all = await listInvitations();
  return all.find(i => i.token === tok) || null;
}

async function getInvitationsByRound(roundId) {
  const all = await listInvitations();
  return all.filter(i => i.roundId === roundId);
}

async function getInvitationsByContact(contactId) {
  const all = await listInvitations();
  return all.filter(i => i.contactId === contactId);
}

async function createRound({ triggeredBy = 'manual', contactIds = [] } = {}) {
  const rounds = await listRounds();
  const invitations = await listInvitations();

  const round = {
    id: id('r'),
    createdAt: new Date().toISOString(),
    triggeredBy,
  };

  const newInvitations = contactIds.map(cid => ({
    id: id('i'),
    token: token(),
    contactId: cid,
    roundId: round.id,
    createdAt: round.createdAt,
    sentAt: null,
    respondedAt: null,
    responseId: null,
    reminderSentAt: null,
  }));

  rounds.push(round);
  await storage.write('rounds', rounds);
  await storage.write('invitations', [...invitations, ...newInvitations]);

  return { round, invitations: newInvitations };
}

async function markInvitationSent(invitationId) {
  const all = await listInvitations();
  const inv = all.find(i => i.id === invitationId);
  if (!inv) return null;
  inv.sentAt = new Date().toISOString();
  await storage.write('invitations', all);
  return inv;
}

async function markInvitationResponded(invitationId, responseId) {
  const all = await listInvitations();
  const inv = all.find(i => i.id === invitationId);
  if (!inv) return null;
  inv.respondedAt = new Date().toISOString();
  inv.responseId = responseId;
  await storage.write('invitations', all);
  return inv;
}

async function markReminderSent(invitationId) {
  const all = await listInvitations();
  const inv = all.find(i => i.id === invitationId);
  if (!inv) return null;
  inv.reminderSentAt = new Date().toISOString();
  await storage.write('invitations', all);
  return inv;
}

function isInvitationExpired(inv) {
  const reference = inv.sentAt || inv.createdAt;
  if (!reference) return false;
  const t = new Date(reference).getTime();
  return Date.now() - t > EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = {
  listRounds,
  listInvitations,
  getInvitationByToken,
  getInvitationsByRound,
  getInvitationsByContact,
  createRound,
  markInvitationSent,
  markInvitationResponded,
  markReminderSent,
  isInvitationExpired,
  EXPIRY_DAYS,
};
