const storage = require('./storage');

// Templates zijn opgeslagen per type/kind/lang.
// - klant: 'nl' en 'en' (per-contact instelbaar)
// - medewerker: alleen 'nl'
// Voor backward-compat: oude opslagvorm (zonder lang-niveau) wordt bij read gemigreerd
// naar 'nl' en het 'en'-template valt terug op de default.
const DEFAULTS = {
  klant: {
    invite: {
      nl: {
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
      en: {
        subject: 'May we ask you for feedback?',
        body: `{{greeting}}

We'd appreciate it if you could take a short moment to give us feedback on our service. It takes less than 3 minutes.

{{link}}

Thank you on behalf of the team.

Kind regards,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
      },
    },
    reminder: {
      nl: {
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
      en: {
        subject: 'Reminder: may we ask you for feedback?',
        body: `{{greeting}}

A few days ago we asked you to briefly give feedback on our service. We'd really value your input — it takes less than 3 minutes.

{{link}}

Thank you on behalf of the team.

Kind regards,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
      },
    },
    confirmation: {
      nl: {
        subject: 'Bedankt voor je feedback',
        body: `{{greeting}}

Bedankt voor het invullen van de survey. We hebben je antwoorden goed ontvangen.

We nemen je input serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.

Met vriendelijke groet,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
      },
      en: {
        subject: 'Thank you for your feedback',
        body: `{{greeting}}

Thank you for filling out the survey. We've received your answers.

We take your input seriously. The team will reach out soon if needed to follow up together.

Kind regards,

Joey Jacobs
Jason Zahi
Guus van de Mond`,
      },
    },
  },
  medewerker: {
    invite: {
      nl: {
        subject: 'Hoe ervaar je je werk op dit moment?',
        body: `{{greeting}}

We willen graag horen hoe je je werk hier op dit moment ervaart. Je antwoorden helpen ons om de werkomgeving beter te maken. Dit kost je minder dan 3 minuten.

{{link}}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Guus van de Mond`,
      },
    },
    reminder: {
      nl: {
        subject: 'Herinnering: hoe ervaar je je werk?',
        body: `{{greeting}}

Een paar dagen geleden hebben we je gevraagd om kort te delen hoe je je werk ervaart. We waarderen je input — het kost je echt minder dan 3 minuten.

{{link}}

Hartelijk bedankt namens het team.

Met vriendelijke groet,

Joey Jacobs
Guus van de Mond`,
      },
    },
    confirmation: {
      nl: {
        subject: 'Bedankt voor je input',
        body: `{{greeting}}

Bedankt voor het invullen van de survey. We hebben je antwoorden goed ontvangen.

We nemen je input serieus. Het team neemt indien nodig binnenkort contact op om er samen verder op door te bouwen.

Met vriendelijke groet,

Joey Jacobs
Guus van de Mond`,
      },
    },
  },
};

const TYPES = ['klant', 'medewerker'];
const KINDS = ['invite', 'reminder', 'confirmation'];
const LANGS_FOR_TYPE = { klant: ['nl', 'en'], medewerker: ['nl'] };

function langsForType(type) {
  return LANGS_FOR_TYPE[type] || ['nl'];
}

function defaultsFor(type, kind, lang) {
  const node = DEFAULTS[type] && DEFAULTS[type][kind];
  if (!node) return { subject: '', body: '' };
  return node[lang] || node.nl || { subject: '', body: '' };
}

// Lees stored value voor (type, kind, lang) en handel oude opslagvorm af.
function readStoredEntry(stored, type, kind, lang) {
  const node = stored && stored[type] && stored[type][kind];
  if (!node) return null;
  // Oude vorm: { subject, body } direct → migreer naar nl
  if (typeof node.subject === 'string' && typeof node.body === 'string') {
    return lang === 'nl' ? { subject: node.subject, body: node.body } : null;
  }
  // Nieuwe vorm: { nl: {subject,body}, en: {...} }
  if (node[lang] && typeof node[lang].subject === 'string') {
    return { subject: node[lang].subject, body: node[lang].body };
  }
  return null;
}

async function getAll() {
  const stored = await storage.read('email_templates', {});
  const out = {};
  for (const t of TYPES) {
    out[t] = {};
    for (const k of KINDS) {
      out[t][k] = {};
      for (const lang of langsForType(t)) {
        const def = defaultsFor(t, k, lang);
        const cust = readStoredEntry(stored, t, k, lang);
        out[t][k][lang] = cust || { subject: def.subject, body: def.body };
      }
    }
  }
  return out;
}

async function getOne(type, kind, lang = 'nl') {
  const t = TYPES.includes(type) ? type : 'klant';
  const k = KINDS.includes(kind) ? kind : 'invite';
  const validLangs = langsForType(t);
  const l = validLangs.includes(lang) ? lang : validLangs[0];
  const stored = await storage.read('email_templates', {});
  const def = defaultsFor(t, k, l);
  const cust = readStoredEntry(stored, t, k, l);
  return cust || { subject: def.subject, body: def.body };
}

async function setOne(type, kind, lang, { subject, body }) {
  if (!TYPES.includes(type)) throw new Error('Invalid type');
  if (!KINDS.includes(kind)) throw new Error('Invalid kind');
  const validLangs = langsForType(type);
  const l = validLangs.includes(lang) ? lang : validLangs[0];
  const stored = await storage.read('email_templates', {});
  if (!stored[type]) stored[type] = {};
  // Migratie van oude vorm: bewaar bestaande {subject,body} als nl voor we 'en' schrijven
  const node = stored[type][kind];
  if (node && typeof node.subject === 'string' && typeof node.body === 'string') {
    stored[type][kind] = { nl: { subject: node.subject, body: node.body } };
  } else if (!node) {
    stored[type][kind] = {};
  }
  stored[type][kind][l] = {
    subject: String(subject == null ? '' : subject),
    body: String(body == null ? '' : body),
  };
  await storage.write('email_templates', stored);
  return stored[type][kind][l];
}

module.exports = { getAll, getOne, setOne, TYPES, KINDS, LANGS_FOR_TYPE, DEFAULTS };
