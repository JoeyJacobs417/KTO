// Ronde-logica: nieuwe ronde aanmaken + mails versturen.
const { Resend } = require('resend');
const contacts = require('./contacts');
const rounds = require('./rounds');
const settings = require('./settings');

function baseUrl() {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function firstName(fullName) {
  if (!fullName) return '';
  return String(fullName).trim().split(/\s+/)[0];
}

function buildInvitationHtml(contact, link) {
  const fn = firstName(contact.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <p>${greeting}</p>
    <p>We zouden het fijn vinden als je een kort moment neemt om ons feedback te geven op onze dienstverlening. Het kost je minder dan 3 minuten.</p>
    <p><a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Start survey</a></p>
    <p style="color:#666;font-size:13px;">Of kopieer deze link: ${link}</p>
    <p>Hartelijk bedankt namens het team.</p>
    <p>Als er nog verdere vragen zijn, contacteer ons dan direct.</p>
    <p>Met vriendelijke groet,<br><br>Joey Jacobs<br>Jason Zahi<br>Guus van de Mond</p>
  </body></html>`;
}

function buildInvitationText(contact, link) {
  const fn = firstName(contact.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  return `${greeting}

We zouden het fijn vinden als je een kort moment neemt om ons feedback te geven op onze dienstverlening. Het kost je minder dan 3 minuten.

${link}

Hartelijk bedankt namens het team.

Als er nog verdere vragen zijn, contacteer ons dan direct.

Met vriendelijke groet,

Joey Jacobs
Jason Zahi
Guus van de Mond`;
}

async function sendInvitation(contact, invitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY ontbreekt — mail niet verzonden naar', contact.email);
    return { sent: false, reason: 'no_api_key' };
  }
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const link = `${baseUrl()}/?t=${invitation.token}`;

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: contact.email,
      subject: 'Mogen we je om feedback vragen?',
      html: buildInvitationHtml(contact, link),
      text: buildInvitationText(contact, link),
    });
    await rounds.markInvitationSent(invitation.id);
    return { sent: true };
  } catch (e) {
    console.error('Resend error voor', contact.email, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

async function startRound({ triggeredBy = 'manual' } = {}) {
  const activeContacts = await contacts.listActive();
  if (activeContacts.length === 0) {
    return { round: null, sent: 0, failed: 0, skipped: 0, error: 'Geen actieve contacten.' };
  }

  const { round, invitations } = await rounds.createRound({
    triggeredBy,
    contactIds: activeContacts.map(c => c.id),
  });

  let sent = 0, failed = 0;
  for (const invitation of invitations) {
    const contact = activeContacts.find(c => c.id === invitation.contactId);
    const res = await sendInvitation(contact, invitation);
    if (res.sent) sent++; else failed++;
  }

  await settings.set({ lastRoundAt: round.createdAt });

  return { round, sent, failed, skipped: 0, total: invitations.length };
}

async function dueForAutoRound() {
  const s = await settings.get();
  if (!s.autoEnabled) return false;
  if (!s.lastRoundAt) return true;
  const last = new Date(s.lastRoundAt).getTime();
  const now = Date.now();
  const dueAfterMs = s.intervalDays * 24 * 60 * 60 * 1000;
  return (now - last) >= dueAfterMs;
}

module.exports = { startRound, sendInvitation, baseUrl, dueForAutoRound };
