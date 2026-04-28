const storage = require('./storage');

// Defaults matchen de huidige hardcoded teksten zodat de gebruiker bij eerste opening
// van de editor de bestaande mail ziet en daar verder op kan bouwen.
const DEFAULTS = {
  klant: {
    invite: {
      subject: 'Mogen we je om feedback vragen?',
      body: `{{greeting}}

We zouden het fijn vinden als je een kort moment neemt om ons feedback te geven op onze dienstverlening. Het kost je minder dan 3 minuten.

{{link}}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
    },
    reminder: {
      subject: 'Herinnering: mogen we je om feedback vragen?',
      body: `{{greeting}}

Een paar dagen geleden hebben we je gevraagd om kort feedback te geven op onze dienstverlening. We zien graag je input — het kost je echt minder dan 3 minuten.

{{link}}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
    },
    confirmation: {
      subject: 'Bedankt voor je feedback',
      body: `{{greeting}}

Bedankt voor het invullen van de survey. We hebben je antwoorden goed ontvangen.

We nemen je input serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.

Met vriendelijke groet,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
    },
  },
  medewerker: {
    invite: {
      subject: 'Hoe ervaar je je werk op dit moment?',
      body: `{{greeting}}

We willen graag horen hoe je je werk hier op dit moment ervaart. Je antwoorden helpen ons om de werkomgeving beter te maken. Dit kost je minder dan 3 minuten.

{{link}}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Guus van de Mond`,
    },
    reminder: {
      subject: 'Herinnering: hoe ervaar je je werk?',
      body: `{{greeting}}

Een paar dagen geleden hebben we je gevraagd om kort te delen hoe je je werk ervaart. We waarderen je input — het kost je echt minder dan 3 minuten.

{{link}}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Guus van de Mond`,
    },
    confirmation: {
      subject: 'Bedankt voor je input',
      body: `{{greeting}}

Bedankt voor het invullen van de survey. We hebben je antwoorden goed ontvangen.

We nemen je input serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.

Met vriendelijke groet,

Joey Jacobs
Guus van de Mond`,
    },
  },
};

const TYPES = ['klant', 'medewerker'];
const KINDS = ['invite', 'reminder', 'confirmation'];

function defaultsFor(type, kind) {
  return (DEFAULTS[type] && DEFAULTS[type][kind]) || { subject: '', body: '' };
}

async function getAll() {
  const stored = await storage.read('email_templates', {});
  const out = {};
  for (const t of TYPES) {
    out[t] = {};
    for (const k of KINDS) {
      const def = defaultsFor(t, k);
      const cust = (stored[t] && stored[t][k]) || {};
      out[t][k] = {
        subject: cust.subject != null ? cust.subject : def.subject,
        body: cust.body != null ? cust.body : def.body,
      };
    }
  }
  return out;
}

async function getOne(type, kind) {
  const t = TYPES.includes(type) ? type : 'klant';
  const k = KINDS.includes(kind) ? kind : 'invite';
  const stored = await storage.read('email_templates', {});
  const def = defaultsFor(t, k);
  const cust = (stored[t] && stored[t][k]) || {};
  return {
    subject: cust.subject != null ? cust.subject : def.subject,
    body: cust.body != null ? cust.body : def.body,
  };
}

async function setOne(type, kind, { subject, body }) {
  if (!TYPES.includes(type)) throw new Error('Invalid type');
  if (!KINDS.includes(kind)) throw new Error('Invalid kind');
  const stored = await storage.read('email_templates', {});
  if (!stored[type]) stored[type] = {};
  stored[type][kind] = {
    subject: String(subject == null ? '' : subject),
    body: String(body == null ? '' : body),
  };
  await storage.write('email_templates', stored);
  return stored[type][kind];
}

module.exports = { getAll, getOne, setOne, TYPES, KINDS, DEFAULTS };
