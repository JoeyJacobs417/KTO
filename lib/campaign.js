const { Resend } = require('resend');
const contacts = require('./contacts');
const rounds = require('./rounds');
const settings = require('./settings');
const audit = require('./audit');

// Type-specifieke configuratie
const CONFIG = {
  klant: {
    detractorRecipients: ['jzahi@machine-learning.company', 'jjacobs@machine-learning.company'],
    summaryRecipient: process.env.MAIL_TO || 'jzahi@machine-learning.company',
    surveyPath: '/',
    inviteSubject: 'Mogen we je om feedback vragen?',
    reminderSubject: 'Herinnering: mogen we je om feedback vragen?',
    confirmationSubject: 'Bedankt voor je feedback',
    inviteIntro: 'We zouden het fijn vinden als je een kort moment neemt om ons feedback te geven op onze dienstverlening. Het kost je minder dan 3 minuten.',
    reminderIntro: 'Een paar dagen geleden hebben we je gevraagd om kort feedback te geven op onze dienstverlening. We zien graag je input — het kost je echt minder dan 3 minuten.',
  },
  medewerker: {
    detractorRecipients: ['jjacobs@machine-learning.company'],
    summaryRecipient: 'jjacobs@machine-learning.company',
    surveyPath: '/medewerker',
    inviteSubject: 'Hoe ervaar je je werk op dit moment?',
    reminderSubject: 'Herinnering: hoe ervaar je je werk?',
    confirmationSubject: 'Bedankt voor je input',
    inviteIntro: 'We willen graag horen hoe je je werk hier op dit moment ervaart. Je antwoorden helpen ons om de werkomgeving beter te maken. Dit kost je minder dan 3 minuten.',
    reminderIntro: 'Een paar dagen geleden hebben we je gevraagd om kort te delen hoe je je werk ervaart. We waarderen je input — het kost je echt minder dan 3 minuten.',
  },
};

const DETRACTOR_THRESHOLD = 6;

function configFor(type) {
  return type === 'medewerker' ? CONFIG.medewerker : CONFIG.klant;
}

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
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nl2br(s) {
  return htmlEscape(s).replace(/\n/g, '<br>');
}

function optOutUrl(token) {
  return `${baseUrl()}/api/optout?t=${token}`;
}

function emailFooter(optOut) {
  return `<p style="font-size:11px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:12px;line-height:1.5;">
    Geen survey-mails meer ontvangen? <a href="${optOut}" style="color:#888;text-decoration:underline;">Klik hier om je uit te schrijven</a>.
  </p>`;
}

function emailFooterText(optOut) {
  return `\n\n---\nGeen survey-mails meer ontvangen? Schrijf je uit via:\n${optOut}`;
}

function buildInviteHtml(contact, link, optOut, type, isReminder = false) {
  const cfg = configFor(type);
  const fn = firstName(contact.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  const intro = isReminder ? cfg.reminderIntro : cfg.inviteIntro;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <p>${greeting}</p>
    <p>${intro}</p>
    <p><a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Start survey</a></p>
    <p style="color:#666;font-size:13px;">Of kopieer deze link: ${link}</p>
    <p>Hartelijk bedankt namens het team.</p>
    <p>Met vriendelijke groet,<br><br>Joey Jacobs<br>Jason Zahi<br>Guus van de Mond</p>
    ${emailFooter(optOut)}
  </body></html>`;
}

function buildInviteText(contact, link, optOut, type, isReminder = false) {
  const cfg = configFor(type);
  const fn = firstName(contact.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';
  const intro = isReminder ? cfg.reminderIntro : cfg.inviteIntro;
  return `${greeting}\n\n${intro}\n\n${link}\n\nHartelijk bedankt namens het team.\n\nMet vriendelijke groet,\n\nJoey Jacobs\nJason Zahi\nGuus van de Mond${emailFooterText(optOut)}`;
}

async function sendInvitation(contact, invitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (contact.optOut) return { sent: false, reason: 'opted_out' };
  if (contact.bounced) return { sent: false, reason: 'bounced' };

  const type = invitation.type || contact.type || 'klant';
  const cfg = configFor(type);
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const link = `${baseUrl()}${cfg.surveyPath}?t=${invitation.token}`;
  const optOut = optOutUrl(invitation.token);

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: contact.email,
      subject: cfg.inviteSubject,
      html: buildInviteHtml(contact, link, optOut, type, false),
      text: buildInviteText(contact, link, optOut, type, false),
    });
    await rounds.markInvitationSent(invitation.id);
    try { await contacts.update(contact.id, { lastInvitedAt: new Date().toISOString() }); } catch {}
    return { sent: true };
  } catch (e) {
    console.error('Resend error voor', contact.email, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

async function sendReminder(contact, invitation) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (contact.optOut) return { sent: false, reason: 'opted_out' };
  if (contact.bounced) return { sent: false, reason: 'bounced' };
  if (rounds.isInvitationExpired(invitation)) return { sent: false, reason: 'expired' };

  const type = invitation.type || contact.type || 'klant';
  const cfg = configFor(type);
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const link = `${baseUrl()}${cfg.surveyPath}?t=${invitation.token}`;
  const optOut = optOutUrl(invitation.token);

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: contact.email,
      subject: cfg.reminderSubject,
      html: buildInviteHtml(contact, link, optOut, type, true),
      text: buildInviteText(contact, link, optOut, type, true),
    });
    await rounds.markReminderSent(invitation.id);
    return { sent: true };
  } catch (e) {
    console.error('Reminder error voor', contact.email, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

async function processReminders(type = null) {
  const types = type ? [type] : ['klant', 'medewerker'];
  const allInvitations = await rounds.listInvitations();
  const allContacts = await contacts.list();
  const contactsById = Object.fromEntries(allContacts.map(c => [c.id, c]));

  let sent = 0, failed = 0, candidates = 0;
  for (const t of types) {
    const s = await settings.get(t);
    if (!s.reminderEnabled) continue;
    const days = Number(s.reminderAfterDays) || 3;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;

    const tInvitations = allInvitations.filter(i =>
      (i.type || 'klant') === t &&
      i.sentAt &&
      !i.respondedAt &&
      !i.reminderSentAt &&
      !rounds.isInvitationExpired(i) &&
      new Date(i.sentAt).getTime() <= threshold
    );
    candidates += tInvitations.length;

    for (const inv of tInvitations) {
      const contact = contactsById[inv.contactId];
      if (!contact || contact.active === false || contact.optOut || contact.bounced) continue;
      const r = await sendReminder(contact, inv);
      if (r.sent) sent++; else failed++;
    }
  }

  if (sent > 0) {
    try {
      await audit.log({ actor: 'system', action: 'reminders.sent', details: { sent, failed, candidates } });
    } catch {}
  }
  return { sent, failed, candidates };
}

async function sendConfirmation(contact, entry) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  const a = entry.answers || {};
  const to = (contact && contact.email) || a.email;
  if (!to) return { sent: false, reason: 'no_email' };

  const type = entry.type || (contact && contact.type) || 'klant';
  const cfg = configFor(type);
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const fn = firstName((contact && contact.name) || a.name);
  const greeting = fn ? `Hoi ${fn},` : 'Hoi,';

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <p>${greeting}</p>
    <p>Bedankt voor het invullen van de survey. We hebben je antwoorden goed ontvangen.</p>
    <p>We nemen je input serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.</p>
    <p>Met vriendelijke groet,<br>Het team</p>
  </body></html>`;
  const text = `${greeting}\n\nBedankt voor het invullen van de survey. We hebben je antwoorden goed ontvangen.\n\nWe nemen je input serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.\n\nMet vriendelijke groet,\nHet team`;

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from, to, subject: cfg.confirmationSubject, html, text });
    return { sent: true };
  } catch (e) {
    console.error('Confirmation error voor', to, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

function buildDetractorAlertHtml(entry, contact, type) {
  const a = entry.answers || {};
  const name = (contact && contact.name) || a.name || 'Onbekend';
  const company = (contact && contact.company) || a.company || '';
  const email = (contact && contact.email) || a.email || '';
  const accountManager = (contact && contact.accountManager) || '';
  const score = a.q1_overall;
  const isMedewerker = type === 'medewerker';

  const rows = [
    a.q1_overall != null ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Cijfer</td><td style="padding:6px 0;"><strong>${score} / 10</strong></td></tr>` : '',
    !isMedewerker && accountManager ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Account manager</td><td style="padding:6px 0;"><strong>${htmlEscape(accountManager)}</strong></td></tr>` : '',
    a.q_low_reason ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;background:#fef2f2;">Reden voor lage score</td><td style="padding:6px 0;background:#fef2f2;"><strong>${nl2br(a.q_low_reason)}</strong></td></tr>` : '',
    a.q6_likes ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${isMedewerker ? 'Energie' : 'Waardeert'}</td><td style="padding:6px 0;">${nl2br(a.q6_likes)}</td></tr>` : '',
    a.q7_improve ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Verbeteren</td><td style="padding:6px 0;">${nl2br(a.q7_improve)}</td></tr>` : '',
    a.q4_extra ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${isMedewerker ? 'Ontwikkeling' : 'AI-kansen'}</td><td style="padding:6px 0;">${nl2br(a.q4_extra)}</td></tr>` : '',
    a.q4_ai_opportunities ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">AI-kansen</td><td style="padding:6px 0;">${nl2br(a.q4_ai_opportunities)}</td></tr>` : '',
  ].filter(Boolean).join('');

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:14px 18px;margin:0 0 20px;border-radius:4px;">
      <strong style="color:#991b1b;">⚠ Lage tevredenheidsscore — neem actie binnen 48 uur</strong>
    </div>
    <p><strong>${htmlEscape(name)}</strong>${company ? (isMedewerker ? ' (' : ' van <strong>') + htmlEscape(company) + (isMedewerker ? ')' : '</strong>') : ''} gaf een <strong>${score} / 10</strong> ${isMedewerker ? 'in de medewerker-tevredenheidssurvey' : 'in de klant-tevredenheidssurvey'}.</p>
    <p>Het advies is om binnen 48 uur persoonlijk contact op te nemen.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
    <p style="margin:0 0 12px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Volledige reactie</p>
    <table style="border-collapse:collapse;">${rows}</table>
    ${email ? `<p style="margin-top:20px;">Contact: <a href="mailto:${htmlEscape(email)}">${htmlEscape(email)}</a></p>` : ''}
    <p style="color:#666;font-size:13px;margin-top:24px;">Verzonden op ${new Date(entry.createdAt).toLocaleString('nl-NL')}.</p>
  </body></html>`;
}

async function sendDetractorAlert(entry, contact) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  const a = entry.answers || {};
  if (a.q1_overall == null || a.q1_overall > DETRACTOR_THRESHOLD) {
    return { sent: false, reason: 'not_detractor' };
  }
  const type = entry.type || (contact && contact.type) || 'klant';
  const cfg = configFor(type);
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const name = (contact && contact.name) || a.name || 'Onbekend';
  const company = (contact && contact.company) || a.company || '';
  const replyTo = (contact && contact.email) || a.email;

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: cfg.detractorRecipients,
      subject: `⚠ Lage score (${a.q1_overall}/10) ${type === 'medewerker' ? '— medewerker' : ''} ${name}${company ? ' — ' + company : ''}`,
      html: buildDetractorAlertHtml(entry, contact, type),
      reply_to: replyTo || undefined,
    });
    try {
      await audit.log({
        actor: 'system', action: 'detractor.alert',
        targetType: 'response', targetId: entry.id,
        targetLabel: `${name} (${a.q1_overall}/10) — ${type}`,
        details: { score: a.q1_overall, type, recipients: cfg.detractorRecipients },
      });
    } catch {}
    return { sent: true };
  } catch (e) {
    console.error('Detractor alert error:', e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

async function startRound({ triggeredBy = 'manual', contactIds = null, sendEmail = true, type = 'klant' } = {}) {
  const t = type === 'medewerker' ? 'medewerker' : 'klant';
  const isBulkAuto = !contactIds || (Array.isArray(contactIds) && contactIds.length === 0);

  let targetContacts;
  if (isBulkAuto) {
    targetContacts = await contacts.listActive(t);
  } else {
    const all = await contacts.list();
    targetContacts = contactIds
      .map(id => all.find(c => c.id === id))
      .filter(Boolean)
      .filter(c => !c.optOut && !c.bounced && (c.type || 'klant') === t);
  }

  if (targetContacts.length === 0) {
    return { round: null, sent: 0, failed: 0, skipped: 0, error: 'Geen geldige contacten.' };
  }

  const { round, invitations } = await rounds.createRound({
    triggeredBy, type: t,
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

  if (triggeredBy === 'auto') {
    await settings.set({ lastRoundAt: round.createdAt }, t);
    try {
      await audit.log({
        actor: 'system', action: 'round.start.auto',
        targetType: 'round', targetId: round.id,
        targetLabel: `Auto-ronde (${t}) ${new Date(round.createdAt).toLocaleString('nl-NL')}`,
        details: { type: t, total: invitations.length, sent, failed },
      });
    } catch {}
  }

  const cfg = configFor(t);
  const invitationsSummary = invitations.map(i => {
    const c = targetContacts.find(c => c.id === i.contactId);
    return {
      id: i.id, token: i.token,
      link: `${baseUrl()}${cfg.surveyPath}?t=${i.token}`,
      contactId: i.contactId,
      contactName: c ? c.name : null,
      contactEmail: c ? c.email : null,
    };
  });

  return { round, sent, failed, skipped: 0, total: invitations.length, invitations: invitationsSummary, sendEmail, type: t };
}

async function dueContacts(type = 'klant') {
  const t = type === 'medewerker' ? 'medewerker' : 'klant';
  const s = await settings.get(t);
  const defaultDays = s.intervalDays || 90;
  const now = Date.now();

  const activeContacts = await contacts.listActive(t);
  const allInvitations = await rounds.listInvitations();
  const latestSentByContact = {};
  for (const inv of allInvitations) {
    if (!inv.sentAt || !inv.contactId) continue;
    if (!latestSentByContact[inv.contactId] || latestSentByContact[inv.contactId] < inv.sentAt) {
      latestSentByContact[inv.contactId] = inv.sentAt;
    }
  }
  return activeContacts.filter(c => {
    const interval = (c.intervalDaysOverride && c.intervalDaysOverride > 0) ? c.intervalDaysOverride : defaultDays;
    const intervalMs = interval * 24 * 60 * 60 * 1000;
    const lastSent = c.lastInvitedAt || latestSentByContact[c.id] || c.createdAt;
    if (!lastSent) return true;
    return (now - new Date(lastSent).getTime()) >= intervalMs;
  });
}

async function dueForAutoRound(type = 'klant') {
  const s = await settings.get(type);
  if (!s.autoEnabled) return false;
  const due = await dueContacts(type);
  return due.length > 0;
}

module.exports = {
  startRound,
  sendInvitation, sendReminder, processReminders,
  sendConfirmation, sendDetractorAlert,
  baseUrl, dueForAutoRound, dueContacts, optOutUrl,
  configFor,
};
