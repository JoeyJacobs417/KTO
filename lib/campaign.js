const { Resend } = require('resend');
const contacts = require('./contacts');
const rounds = require('./rounds');
const settings = require('./settings');
const audit = require('./audit');
const emailTemplates = require('./emailTemplates');

// Type-specifieke configuratie (alleen non-template-instellingen).
// Subjects en body's leven nu in lib/emailTemplates.js en zijn via de admin
// te bewerken.
const CONFIG = {
  klant: {
    detractorRecipients: ['jzahi@machine-learning.company', 'jjacobs@machine-learning.company'],
    summaryRecipient: process.env.MAIL_TO || 'jzahi@machine-learning.company',
    surveyPath: '/',
  },
  medewerker: {
    detractorRecipients: ['jjacobs@machine-learning.company'],
    summaryRecipient: 'jjacobs@machine-learning.company',
    surveyPath: '/medewerker',
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

function emailFooterHtml(optOut) {
  return `<p style="font-size:11px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:12px;line-height:1.5;">
    Geen survey-mails meer ontvangen? <a href="${optOut}" style="color:#888;text-decoration:underline;">Klik hier om je uit te schrijven</a>.
  </p>`;
}

function emailFooterText(optOut) {
  return `\n\n---\nGeen survey-mails meer ontvangen? Schrijf je uit via:\n${optOut}`;
}

// Variabele-substitutie. Onbekende variabelen blijven leeg.
function substituteText(body, vars) {
  return String(body).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars[k] != null ? String(vars[k]) : ''));
}

// HTML-rendering: escape eerst alles, vervang dan vars (met geescapeede waardes),
// {{link}} wordt een knop, alinea's worden <p>'s.
function renderHtmlBody(body, vars) {
  let s = htmlEscape(body);
  for (const k of Object.keys(vars)) {
    if (k === 'link') continue;
    const re = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
    s = s.replace(re, htmlEscape(vars[k] == null ? '' : String(vars[k])));
  }
  if (vars.link) {
    const safeLink = htmlEscape(String(vars.link));
    const button = `<a href="${safeLink}" style="display:inline-block;background:#7c5cff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Start survey</a>`;
    s = s.replace(/\{\{link\}\}/g, button);
  } else {
    // Geen link beschikbaar — verwijder placeholder
    s = s.replace(/\{\{link\}\}/g, '');
  }
  // Alinea's
  const paragraphs = s.split(/\n\n+/).map(p => p.replace(/\n/g, '<br>'));
  return paragraphs.filter(p => p.length > 0).map(p => `<p>${p}</p>`).join('');
}

function buildVars(contact, link) {
  const fn = firstName(contact && contact.name);
  return {
    firstName: fn,
    name: (contact && contact.name) || '',
    greeting: fn ? `Hoi ${fn},` : 'Hoi,',
    link: link || '',
  };
}

async function buildEmail(type, kind, vars, optOut) {
  const tpl = await emailTemplates.getOne(type, kind);
  const subject = substituteText(tpl.subject, vars);
  const textBody = substituteText(tpl.body, vars);
  const htmlBody = renderHtmlBody(tpl.body, vars);
  const includeOptOut = !!optOut;
  const text = includeOptOut ? textBody + emailFooterText(optOut) : textBody;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">${htmlBody}${includeOptOut ? emailFooterHtml(optOut) : ''}</body></html>`;
  return { subject, html, text };
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

  const vars = buildVars(contact, link);
  const { subject, html, text } = await buildEmail(type, 'invite', vars, optOut);

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from, to: contact.email, subject, html, text });
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

  const vars = buildVars(contact, link);
  const { subject, html, text } = await buildEmail(type, 'reminder', vars, optOut);

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from, to: contact.email, subject, html, text });
    await rounds.markReminderSent(invitation.id);
    return { sent: true };
  } catch (e) {
    console.error('Reminder error voor', contact.email, e);
    return { sent: false, reason: 'send_error', error: String(e) };
  }
}

function reminderCountOf(inv) {
  if (typeof inv.reminderCount === 'number') return inv.reminderCount;
  return inv.reminderSentAt ? 1 : 0;
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
    const maxCount = Math.max(1, Math.min(5, Number(s.reminderMaxCount) || 1));
    const intervalMs = days * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const tInvitations = allInvitations.filter(i => {
      if ((i.type || 'klant') !== t) return false;
      if (!i.sentAt) return false;
      if (i.respondedAt) return false;
      if (rounds.isInvitationExpired(i)) return false;
      if (reminderCountOf(i) >= maxCount) return false;
      // Ten opzichte van laatste actiemoment: laatste reminder, anders eerste verzending.
      const lastTime = i.reminderSentAt || i.sentAt;
      return (now - new Date(lastTime).getTime()) >= intervalMs;
    });
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

// Vraaglabels voor de antwoorden-sectie in de bevestigingsmail (NL / EN).
const ANSWER_LABELS = {
  klant: {
    q1_overall: 'Cijfer voor onze dienstverlening / Service rating',
    q_low_reason: 'Belangrijkste reden voor lage score / Main reason for low score',
    q6_likes: 'Wat je het meest waardeert / What you value most',
    q7_improve: 'Wat we kunnen verbeteren / What we can improve',
    q4_ai_opportunities: 'Kansen voor AI / Opportunities for AI',
  },
  medewerker: {
    q1_overall: 'Cijfer werkbeleving / Work experience rating',
    q_low_reason: 'Belangrijkste reden voor lage score / Main reason for low score',
    q6_likes: 'Wat je het meeste energie geeft / What gives you most energy',
    q7_improve: 'Wat anders of beter mag / What could be different or better',
    q4_extra: 'Ontwikkeling en groei / Development and growth',
  },
};

function buildAnswersHtml(entry, type) {
  const a = entry.answers || {};
  const labels = ANSWER_LABELS[type] || ANSWER_LABELS.klant;
  const rows = Object.entries(labels)
    .map(([k, label]) => {
      const v = a[k];
      if (v === undefined || v === '' || v === null) return '';
      const valueHtml = k === 'q1_overall' ? `<strong>${htmlEscape(String(v))} / 10</strong>` : nl2br(String(v));
      return `<tr><td style="padding:6px 14px 6px 0;color:#666;vertical-align:top;font-size:13px;">${htmlEscape(label)}</td><td style="padding:6px 0;font-size:13px;">${valueHtml}</td></tr>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="margin:0 0 12px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Je antwoorden / Your answers</p>
    <table style="border-collapse:collapse;">${rows}</table>`;
}

function buildAnswersText(entry, type) {
  const a = entry.answers || {};
  const labels = ANSWER_LABELS[type] || ANSWER_LABELS.klant;
  const lines = Object.entries(labels)
    .map(([k, label]) => {
      const v = a[k];
      if (v === undefined || v === '' || v === null) return null;
      if (k === 'q1_overall') return `${label}: ${v} / 10`;
      return `${label}:\n${v}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return '';
  return `\n\n---\nJe antwoorden / Your answers\n\n${lines.join('\n\n')}`;
}

async function sendConfirmation(contact, entry) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  const a = entry.answers || {};
  const to = (contact && contact.email) || a.email;
  if (!to) return { sent: false, reason: 'no_email' };

  const type = entry.type || (contact && contact.type) || 'klant';
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';

  // Bevestiging gebruikt naam uit contact óf antwoorden, en heeft geen survey-link.
  const fakeContact = contact || { name: a.name || '' };
  const vars = buildVars(fakeContact, '');
  const tpl = await emailTemplates.getOne(type, 'confirmation');
  const subject = substituteText(tpl.subject, vars);
  const textBody = substituteText(tpl.body, vars);
  const htmlBody = renderHtmlBody(tpl.body, vars);

  const answersHtml = buildAnswersHtml(entry, type);
  const answersText = buildAnswersText(entry, type);

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">${htmlBody}${answersHtml}</body></html>`;
  const text = textBody + answersText;

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from, to, subject, html, text });
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
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const name = (contact && contact.name) || a.name || 'Onbekend';
  const company = (contact && contact.company) || a.company || '';
  const replyTo = (contact && contact.email) || a.email;

  const s = await settings.get(type);
  const recipients = Array.isArray(s.detractorRecipients) ? s.detractorRecipients : [];
  if (recipients.length === 0) return { sent: false, reason: 'no_recipients' };

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from,
      to: recipients,
      subject: `⚠ Lage score (${a.q1_overall}/10) ${type === 'medewerker' ? '— medewerker' : ''} ${name}${company ? ' — ' + company : ''}`,
      html: buildDetractorAlertHtml(entry, contact, type),
      reply_to: replyTo || undefined,
    });
    try {
      await audit.log({
        actor: 'system', action: 'detractor.alert',
        targetType: 'response', targetId: entry.id,
        targetLabel: `${name} (${a.q1_overall}/10) — ${type}`,
        details: { score: a.q1_overall, type, recipients },
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
