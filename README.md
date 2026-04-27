# Klanttevredenheidsonderzoek

Webapp voor terugkerend klanttevredenheidsonderzoek. Je beheert contacten,
stuurt gepersonaliseerde surveys uit (handmatig of op vast interval), en ziet
per contact hoe het cijfer zich ontwikkelt over de tijd.

## Wat zit erin

- **Survey** op `/` — 4 vragen, invultijd < 3 minuten. Als de URL een token
  bevat (`/?t=...`) wordt de contactinfo automatisch ingevuld en de inzending
  gekoppeld aan het juiste contact en de juiste ronde.
- **Contactbeheer** — voeg contacten één voor één toe of importeer een CSV.
- **Rondes** — elke ronde krijgen alle actieve contacten een unieke
  survey-link per mail. Je kunt een ronde handmatig starten, of de app stelt
  automatisch in op een vast interval (bv. elke 90 dagen).
- **Mail-verzending** via Resend, met gepersonaliseerde uitnodiging per contact.
- **Admin-dashboard** met tabs:
    - Overzicht — overall stats + recente reacties + tijdlijn per contact
    - Contacten — lijst + toevoegen + CSV-import + activeren/deactiveren
    - Rondes — historie met response rate per ronde
    - Instellingen — interval + auto-versturen aan/uit

## Snel lokaal draaien

```bash
npm install
cp .env.example .env
# vul .env in (minimaal: ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET,
# CRON_SECRET; RESEND_API_KEY optioneel voor mailverzending)
npm start
```

- Survey:       http://localhost:3000/
- Admin login:  http://localhost:3000/admin/login

## Deployen naar Vercel

Zie **[DEPLOY.md](./DEPLOY.md)** voor de volledige stap-voor-stap gids
(zonder installaties, alles via de browser).

Kort samengevat:
1. Push code naar GitHub.
2. Importeer het project in Vercel.
3. Vul environment variables in.
4. Voeg Vercel KV toe via tab **Storage** — de app detecteert dit automatisch
   en gebruikt KV i.p.v. lokale JSON-bestanden voor persistentie.
5. Vercel Cron draait dagelijks om 09:00 UTC en start een nieuwe ronde zodra
   het configureerde interval verstreken is.

### Storage-backend

`lib/storage.js` detecteert `KV_REST_API_URL` + `KV_REST_API_TOKEN` (of de
`UPSTASH_REDIS_REST_*` equivalenten) automatisch:
- Zonder deze vars → schrijft naar `./data/*.json` (lokaal / eigen server).
- Met deze vars → gebruikt Vercel KV (Upstash Redis).

Lokaal werkt het dus altijd via JSON-bestanden; op Vercel wordt KV gebruikt.

## Environment variables

| Variabele         | Waarvoor                                                         |
|-------------------|------------------------------------------------------------------|
| `RESEND_API_KEY`  | API key van https://resend.com (gratis tier is voldoende)         |
| `MAIL_FROM`       | Afzender (onder eigen domein verifiëren voor productie)            |
| `MAIL_TO`         | Fallback-ontvanger voor ad-hoc inzendingen zonder token           |
| `ADMIN_USERNAME`  | Admin gebruikersnaam                                             |
| `ADMIN_PASSWORD`  | Admin wachtwoord                                                 |
| `SESSION_SECRET`  | Lange random string (min 16 chars)                                |
| `CRON_SECRET`     | Secret voor `/api/cron`; Vercel Cron stuurt dit mee               |
| `APP_BASE_URL`    | Publieke URL voor survey-links in mails (bv. https://survey.jouwbedrijf.nl) |

## Vragen

1. Welk cijfer geef je ons voor onze dienstverlening (1–10, verplicht)
2. Wat waardeer je het meest (open, optioneel)
3. Wat kan beter (open, optioneel)
4. Waar zie je nog meer kansen voor AI (open, optioneel)
5. Naam / bedrijf / e-mail — alleen voor surveys zonder token (anders prefilled)

## CSV-formaat voor contact-import

Comma- of puntkomma-gescheiden, met headerregel. Herkent deze kolomnamen
(hoofdletter-ongevoelig): `name` / `naam`, `company` / `bedrijf` /
`organisatie`, `email` / `e-mail` / `mail`.

```csv
name,company,email
Sanne de Vries,Acme BV,sanne@acme.nl
Martijn Bakker,Bakker Consult,martijn@bakker.nl
```

Dubbele e-mailadressen worden overgeslagen (geen foutmelding).

## Structuur

```
customer-survey/
├── api/
│   ├── submit.js         # ontvangt survey + linkt via token + mailt + slaat op
│   ├── login.js          # admin login/logout
│   ├── responses.js      # stats + antwoorden (met contact info)
│   ├── contacts.js       # CRUD + CSV-import
│   ├── rounds.js         # lijst + nieuwe ronde starten
│   ├── settings.js       # GET/PUT interval + auto
│   ├── cron.js           # door Vercel Cron aangeroepen
│   └── invitation.js     # publiek: token → contact info
├── lib/
│   ├── auth.js           # HMAC cookie auth
│   ├── storage.js        # JSON-file storage (generiek)
│   ├── ids.js            # id/token generatie
│   ├── contacts.js       # contactdata + CSV-parser
│   ├── rounds.js         # rondes + invitaties
│   ├── settings.js       # app-instellingen
│   └── campaign.js       # ronde starten + mail versturen
├── public/
│   ├── index.html        # survey (herkent ?t=token)
│   ├── thanks.html
│   ├── admin-login.html
│   ├── admin.html        # dashboard (4 tabs)
│   └── styles.css        # huisstijl (light mode)
├── data/                 # JSON-opslag (automatisch aangemaakt)
│   ├── responses.json
│   ├── contacts.json
│   ├── rounds.json
│   ├── invitations.json
│   └── settings.json
├── local-server.js       # voor `npm start` (lokaal/eigen server, incl. scheduler)
├── package.json
├── vercel.json           # rewrites + cron
└── .env.example
```

## Huisstijl aanpassen

Alle kleuren en typografie staan bovenaan `public/styles.css` in CSS-variabelen
(`--accent`, `--accent-grad`, `--bg`, `--text`, …). Pas die aan voor exacte
powersuite.ai-kleuren.
