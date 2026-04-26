const { Resend } = require('resend');
const contacts = require('./contacts');
const rounds = require('./rounds');
const settings = require('./settings');

const DETRACTOR_RECIPIENTS = ['jzahi@machine-learning.company', 'jjacobs@machine-learning.company'];
const DETRACTOR_THRESHOLD = 6;

function baseUrl() {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function firstName(fullName) {
  if (!fullName) return '';
  return String(fullName).trim().split(/\s+/)[0];
}

function htmlEscape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s) {
  return htmlEscape(s).replace(/\n/g, '<br>');
}

function optOutUrl(token) {
  return `${baseUrl()}/api/optout?t=${token}`;
}

function emailFooter(optOut) {
  return `<p style="font-size:11px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:12px;line-height:1.5;">
    Geen klanttevredenheidsmails meer ontvangen? <a href="${optOut}" style="color:#888;text-decoration:underline;">Klik hier om je uit te schrijven</a>.
  </p>`;
}

function emailFooterText(optOut) {
  return `\n\n---\nGeen klanttevredenheidsmails meer ontvangen? Schrijf je uit via:\n${optOut}`;
}

// ============ Uitnodiging ============
function buildInvitationHtml(contact, link, optOut) {
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
    ${emailFooter(optOut)}
  </body></html>`;
}

function buildInvitationText(contact, link, optOut) {
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
Guus van de Mond${emailFooterText(optOut)}`;
}

async function sendInvitation(contact, invitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY ontbreekt — uitnodiging niet verzonden naar', contact.email);
    return { sent: false, reason: 'no_api_key' };
  }
  if (contact.optOut) return { sent: false, reason: 'opted_out' };

  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const link = `${baseUrl()}/?t=${invitation.token}`;
  const optOut = optOutUrl(invitation.token);

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: contact.email,
      subject: 'Mogen we je om feedback vragen?',
      html: buildInvitationHtml(contact, link, optOut),
      text: buildInvitationText(contact, link, optOut),
    });
    await rounds.markInvitationSent(invitation.id);
    return { sent: true };
  } catch (e) {
    console.error('Resend error voor', contact.email, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

// ============ Herinnering ============
function buildReminderHtml(contact, link, optOut) {
  const fn = firstName(contact.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <p>${greeting}</p>
    <p>Een paar dagen geleden hebben we je gevraagd om kort feedback te geven op onze dienstverlening. We zien graag je input — het kost je echt minder dan 3 minuten.</p>
    <p><a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Start survey</a></p>
    <p style="color:#666;font-size:13px;">Of kopieer deze link: ${link}</p>
    <p>Hartelijk bedankt namens het team.</p>
    <p>Met vriendelijke groet,<br><br>Joey Jacobs<br>Jason Zahi<br>Guus van de Mond</p>
    ${emailFooter(optOut)}
  </body></html>`;
}

function buildReminderText(contact, link, optOut) {
  const fn = firstName(contact.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  return `${greeting}

Een paar dagen geleden hebben we je gevraagd om kort feedback te geven op onze dienstverlening. We zien graag je input — het kost je echt minder dan 3 minuten.

${link}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Jason Zahi
Guus van de Mond${emailFooterText(optOut)}`;
}

async function sendReminder(contact, invitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (contact.optOut) return { sent: false, reason: 'opted_out' };
  if (rounds.isInvitationExpired(invitation)) return { sent: false, reason: 'expired' };

  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const link = `${baseUrl()}/?t=${invitation.token}`;
  const optOut = optOutUrl(invitation.token);

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: contact.email,
      subject: 'Herinnering: mogen we je om feedback vragen?',
      html: buildReminderHtml(contact, link, optOut),
      text: buildReminderText(contact, link, optOut),
    });
    await rounds.markReminderSent(invitation.id);
    return { sent: true };
  } catch (e) {
    console.error('Reminder error voor', contact.email, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

async function processReminders() {
  const s = await settings.get();
  if (!s.reminderEnabled) {
    return { sent: 0, skipped: 0, reason: 'disabled' };
  }
  const days = Number(s.reminderAfterDays) || 3;
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;

  const allInvitations = await rounds.listInvitations();
  const allContacts = await contacts.list();
  const contactsById = Object.fromEntries(allContacts.map(c => [c.id, c]));

  const candidates = allInvitations.filter(i =>
    i.sentAt &&
    !i.respondedAt &&
    !i.reminderSentAt &&
    !rounds.isInvitationExpired(i) &&
    new Date(i.sentAt).getTime() <= threshold
  );

  let sent = 0, failed = 0;
  for (const inv of candidates) {
    const contact = contactsById[inv.contactId];
    if (!contact || contact.active === false || contact.optOut) continue;
    const r = await sendReminder(contact, inv);
    if (r.sent) sent++; else failed++;
  }
  return { sent, failed, candidates: candidates.length };
}

// ============ Bevestiging respondent ============
function buildConfirmationHtml(contact, answers) {
  const name = (contact && contact.name) || answers.name;
  const fn = firstName(name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <p>${greeting}</p>
    <p>Bedankt voor het invullen van onze survey. We hebben je antwoorden goed ontvangen.</p>
    <p>We nemen je feedback serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.</p>
    <p>Met vriendelijke groet,<br>Het team</p>
  </body></html>`;
}

function buildConfirmationText(contact, answers) {
  const name = (contact && contact.name) || answers.name;
  const fn = firstName(name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  return `${greeting}

Bedankt voor het invullen van onze survey. We hebben je antwoorden goed ontvangen.

We nemen je feedback serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.

Met vriendelijke groet,
Het team`;
}

async function sendConfirmation(contact, entry) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  const a = entry.answers || {};
  const to = (contact && contact.email) || a.email;
  if (!to) return { sent: false, reason: 'no_email' };

  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to,
      subject: 'Bedankt voor je feedback',
      html: buildConfirmationHtml(contact, a),
      text: buildConfirmationText(contact, a),
    });
    return { sent: true };
  } catch (e) {
    console.error('Confirmation error voor', to, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

// ============ Detractor alert ============
function buildDetractorAlertHtml(entry, contact) {
  const a = entry.answers || {};
  const name = (contact && contact.name) || a.name || 'Onbekend';
  const company = (contact && contact.company) || a.company || '';
  const email = (contact && contact.email) || a.email || '';
  const accountManager = (contact && contact.accountManager) || '';
  const score = a.q1_overall;

  const rows = [
    a.q1_overall != null ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Cijfer</td><td style="padding:6px 0;"><strong>${score} / 10</strong></td></tr>` : '',
    accountManager ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Account manager</td><td style="padding:6px 0;"><strong>${htmlEscape(accountManager)}</strong></td></tr>` : '',
    a.q6_likes ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Waardeert</td><td style="padding:6px 0;">${nl2br(a.q6_likes)}</td></tr>` : '',
    a.q7_improve ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Verbeteren</td><td style="padding:6px 0;">${nl2br(a.q7_improve)}</td></tr>` : '',
    a.q4_ai_opportunities ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">AI-kansen</td><td style="padding:6px 0;">${nl2br(a.q4_ai_opportunities)}</td></tr>` : '',
  ].filter(Boolean).join('');

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:14px 18px;margin:0 0 20px;border-radius:4px;">
      <strong style="color:#991b1b;">⚠ Lage tevredenheidsscore — neem actie binnen 48 uur</strong>
    </div>
    <p><strong>${htmlEscape(name)}</strong>${company ? ' van <strong>' + htmlEscape(company) + '</strong>' : ''} gaf een <strong>${score} / 10</strong>.</p>
    ${accountManager ? `<p>Account manager voor dit contact: <strong>${htmlEscape(accountManager)}</strong>.</p>` : ''}
    <p>Het advies is om binnen 48 uur persoonlijk contact op te nemen om de score te bespreken en eventuele zorgen weg te nemen.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
    <p style="margin:0 0 12px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Volledige reactie</p>
    <table style="border-collapse:collapse;">${rows}</table>
    ${email ? `<p style="margin-top:20px;">Contact: <a href="mailto:${htmlEscape(email)}">${htmlEscape(email)}</a></p>` : ''}
    <p style="color:#666;font-size:13px;margin-top:24px;">Verzonden door het klanttevredenheids-systeem op ${new Date(entry.createdAt).toLocaleString('nl-NL')}.</p>
  </body></html>`;
}

async function sendDetractorAlert(entry, contact) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  const a = entry.answers || {};
  if (a.q1_overall == null || a.q1_overall > DETRACTOR_THRESHOLD) {
    return { sent: false, reason: 'not_detractor' };
  }

  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const name = (contact && contact.name) || a.name || 'Onbekend';
  const company = (contact && contact.company) || a.company || '';
  const replyTo = (contact && contact.email) || a.email;

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: DETRACTOR_RECIPIENTS,
      subject: `⚠ Lage score (${a.q1_overall}/10) van ${name}${company ? ' — ' + company : ''}`,
      html: buildDetractorAlertHtml(entry, contact),
      reply_to: replyTo || undefined,
    });
    return { sent: true };
  } catch (e) {
    console.error('Detractor alert error:', e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

// ============ Ronde starten ============
async function startRound({ triggeredBy = 'manual', contactIds = null, sendEmail = true } = {}) {
  const isBulkAuto = !contactIds || (Array.isArray(contactIds) && contactIds.length === 0);

  let targetContacts;
  if (isBulkAuto) {
    targetContacts = await contacts.listActive();
  } else {
    const all = await contacts.list();
    targetContacts = contactIds
      .map(id => all.find(c => c.id === id))
      .filter(Boolean)
      .filter(c => !c.optOut);
  }

  if (targetContacts.length === 0) {
    return { round: null, sent: 0, failed: 0, skipped: 0, error: 'Geen geldige contacten.' };
  }

  const { round, invitations } = await rounds.createRound({
    triggeredBy,
    contactIds: targetContacts.map(c => c.id),
  });

  let sent = 0, failed = 0;
  if (sendEmail) {
    for (const invitation of invitations) {
      const contact = targetContacts.find(c => c.id === invitation.contactId);
      const res = await sendInvitation(contact, invitation);
      if (res.sent) sent++; else failed++;
    }
  }

  if (isBulkAuto) {
    await settings.set({ lastRoundAt: round.createdAt });
  }

  const invitationsSummary = invitations.map(i => {
    const c = targetContacts.find(c => c.id === i.contactId);
    return {
      id: i.id,
      token: i.token,
      link: `${baseUrl()}/?t=${i.token}`,
      contactId: i.contactId,
      contactName: c ? c.name : null,
      contactEmail: c ? c.email : null,
    };
  });

  return {
    round,
    sent,
    failed,
    skipped: 0,
    total: invitations.length,
    invitations: invitationsSummary,
    sendEmail,
  };
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

module.exports = {
  startRound,
  sendInvitation,
  sendReminder,
  processReminders,
  sendConfirmation,
  sendDetractorAlert,
  baseUrl,
  dueForAutoRound,
  optOutUrl,
};
