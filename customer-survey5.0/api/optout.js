const rounds = require('../lib/rounds');
const contacts = require('../lib/contacts');
const audit = require('../lib/audit');

function renderHtml(title, message) {
  const safeTitle = String(title).replace(/</g, '&lt;');
  const safeMessage = String(message).replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="container" style="text-align:center;">
    <div class="brand" style="justify-content:center;">
      <div class="logo" aria-hidden="true"></div>
      <div class="name">Klanttevredenheidsonderzoek</div>
    </div>
    <h1>${safeTitle}</h1>
    <p class="lead">${safeMessage}</p>
  </main>
</body>
</html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const url = new URL(req.url, 'http://localhost');
  const tok = url.searchParams.get('t');

  if (!tok) {
    res.statusCode = 400;
    return res.end(renderHtml('Ongeldige link', 'Deze opt-out link is ongeldig.'));
  }

  const inv = await rounds.getInvitationByToken(tok);
  if (!inv) {
    res.statusCode = 404;
    return res.end(renderHtml('Ongeldige link', 'Deze opt-out link is ongeldig of bestaat niet.'));
  }

  try {
    const before = await contacts.getById(inv.contactId);
    await contacts.update(inv.contactId, { optOut: true, active: false });
    try {
      await audit.log({
        actor: 'public',
        ip: audit.getIp(req),
        action: 'contact.optout',
        targetType: 'contact',
        targetId: inv.contactId,
        targetLabel: before ? ([before.name, before.company].filter(Boolean).join(' — ') || before.email) : inv.contactId,
      });
    } catch (e) { console.error('Audit error:', e); }
  } catch (e) {
    console.error('Opt-out update error:', e);
    res.statusCode = 500;
    return res.end(renderHtml('Er ging iets mis', 'We konden je voorkeur niet opslaan. Stuur ons een mailtje en we regelen het handmatig.'));
  }

  res.statusCode = 200;
  res.end(renderHtml(
    'Je bent uitgeschreven',
    'Je ontvangt geen klanttevredenheidsmails meer van ons. Mocht je hier op terug willen komen, stuur ons gewoon een mailtje.'
  ));
};
