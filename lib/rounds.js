const storage = require('./storage');
const { id, token } = require('./ids');

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
    sentAt: null,
    respondedAt: null,
    responseId: null,
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

module.exports = {
  listRounds,
  listInvitations,
  getInvitationByToken,
  getInvitationsByRound,
  getInvitationsByContact,
  createRound,
  markInvitationSent,
  markInvitationResponded,
};
