const { Resend } = require('resend');
const storage = require('../lib/storage');
const roundsLib = require('../lib/rounds');
const contactsLib = require('../lib/contacts');
const campaign = require('../lib/campaign');
const { id: newId } = require('../lib/ids');

const QUESTION_LABELS = {
  q1_overall: 'Cijfer dienstverlening (1-10)',
  q_low_reason: 'Belangrijkste reden voor lage score',
  q6_likes: 'Wat waardeer je het meest',
  q7_improve: 'Wat kan beter',
  q4_ai_opportunities: 'Kansen voor AI',
  name: 'Naam',
  company: 'Bedrijf',
  email: 'E-mail',
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 50_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function clean(v, max = 1000) {
  if (v == null) return '';
  return String(v).slice(0, max);
}

function validateNumeric(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function buildEmailHtml(entry) {
  const rows = Object.entries(QUESTION_LABELS)
    .map(([k, label]) => {
      const v = entry.answers[k];
      if (v === undefined || v === '' || v === null) return '';
      return `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${label}</td><td style="padding:6px 0;"><strong>${String(v).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</strong></td></tr>`;
    })
    .join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;">
    <h2 style="margin:0 0 8px;">Nieuwe survey-inzending</h2>
    <p style="color:#666;margin:0 0 16px;">${new Date(entry.createdAt).toLocaleString('nl-NL')}</p>
    <table style="border-collapse:collapse;">${rows}</table>
  </body></html>`;
}

function buildEmailText(entry) {
  return Object.entries(QUESTION_LABELS)
    .map(([k, label]) => {
      const v = entry.answers[k];
      if (v === undefined || v === '' || v === null) return null;
      return `${label}: ${v}`;
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : await readJson(req);
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid JSON' }));
  }

  if (body.website) {
    res.statusCode = 204;
    return res.end();
  }

  const answers = {
    q1_overall: validateNumeric(body.q1_overall, 1, 10),
    q_low_reason: clean(body.q_low_reason, 600),
    q6_likes: clean(body.q6_likes, 600),
    q7_improve: clean(body.q7_improve, 600),
    q4_ai_opportunities: clean(body.q4_ai_opportunities, 600),
    name: clean(body.name, 120),
    company: clean(body.company, 120),
    email: clean(body.email, 160),
  };

  // Verplichte velden
  if (answers.q1_overall == null) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Ongeldig of ontbrekend veld: q1_overall' }));
  }

  // Conditioneel verplicht: bij score ≤ 6 moet de vervolgvraag ingevuld zijn
  if (answers.q1_overall <= 6 && (!answers.q_low_reason || answers.q_low_reason.trim().length === 0)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Bij een score van 6 of lager is de vervolgvraag verplicht.' }));
  }

  let invitation = null;
  let contact = null;

  if (body.token) {
    invitation = await roundsLib.getInvitationByToken(String(body.token));
    if (invitation) {
      if (invitation.respondedAt) {
        res.statusCode = 410;
        return res.end(JSON.stringify({ error: 'Deze survey is al ingevuld.' }));
      }
      if (roundsLib.isInvitationExpired(invitation)) {
        res.statusCode = 410;
        return res.end(JSON.stringify({ error: 'Deze link is verlopen.' }));
      }
      contact = await contactsLib.getById(invitation.contactId);
    }
  } else if (answers.email) {
    contact = await contactsLib.getByEmail(answers.email);
    if (contact) {
      const invitations = await roundsLib.getInvitationsByContact(contact.id);
      const open = invitations
        .filter(i => !i.respondedAt && !roundsLib.isInvitationExpired(i))
        .sort((a, b) => {
          const ta = new Date(a.sentAt || 0).getTime();
          const tb = new Date(b.sentAt || 0).getTime();
          return tb - ta;
        });
      if (open.length > 0) invitation = open[0];
    }
  }

  if (contact) {
    answers.name = contact.name || answers.name;
    answers.company = contact.company || answers.company;
    answers.email = contact.email || answers.email;
  }

  const entry = {
    id: newId('resp'),
    createdAt: new Date().toISOString(),
    contactId: contact ? contact.id : null,
    roundId: invitation ? invitation.roundId : null,
    invitationId: invitation ? invitation.id : null,
    answers,
  };

  try {
    await storage.append(entry);
    if (invitation) {
      await roundsLib.markInvitationResponded(invitation.id, entry.id);
    }
  } catch (e) {
    console.error('Storage error:', e);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.MAIL_TO || 'jzahi@machine-learning.company';
  const from = process.env.MAIL_FROM || 'onboarding@resend.dev';

  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from,
        to,
        subject: `Nieuwe survey-inzending${answers.name ? ` — ${answers.name}` : ''}${answers.company ? ` (${answers.company})` : ''}`,
        html: buildEmailHtml(entry),
        text: buildEmailText(entry),
        reply_to: answers.email || undefined,
      });
    } catch (e) {
      console.error('Resend summary error:', e);
    }
  }

  try { await campaign.sendDetractorAlert(entry, contact); } catch (e) { console.error('Detractor alert error:', e); }
  try { await campaign.sendConfirmation(contact, entry); } catch (e) { console.error('Confirmation error:', e); }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, id: entry.id }));
};
