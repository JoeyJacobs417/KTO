# Deploy-gids — gratis via Vercel

Deze gids is gemaakt voor niet-developers. Je hoeft niets te installeren; alles
gaat via de browser. Totale tijd: ~20 minuten. Kosten: €0 voor normaal gebruik
(gratis tiers van Vercel + Resend).

Je krijgt uiteindelijk een URL zoals `https://jouw-survey.vercel.app` die je
naar klanten kunt sturen.

---

## Stap 1 — Accounts aanmaken (5 min)

Maak deze drie accounts aan (allemaal gratis):

1. **GitHub** — <https://github.com/signup>
2. **Vercel** — <https://vercel.com/signup> — kies **Continue with GitHub**
3. **Resend** — <https://resend.com/signup> — kies **Continue with GitHub**

Door steeds op "Continue with GitHub" te klikken hoef je niet meerdere keren
wachtwoorden aan te maken.

---

## Stap 2 — Projectbestanden naar GitHub zetten (5 min)

1. Ga naar <https://github.com/new>.
2. Vul in:
   - **Repository name**: `customer-survey`
   - **Visibility**: zet op **Private**
3. Klik **Create repository**.
4. Op de volgende pagina zie je meerdere opties. Klik op **uploading an existing file**
   (het staat in de grijze tekst; of ga direct naar
   `github.com/JOUW_USERNAME/customer-survey/upload/main`).
5. Open de projectmap op je computer (de map `customer-survey` met alle
   bestanden).
6. Selecteer alle bestanden en mappen binnen de projectmap (**behalve** de map
   `node_modules`) en sleep ze naar het upload-venster van GitHub.
7. Scroll naar beneden, klik **Commit changes**.

> Als GitHub klaagt dat de upload te groot is: je hebt `node_modules` per
> ongeluk meegenomen. Die mag eruit — Vercel installeert dependencies zelf.

---

## Stap 3 — Deploy naar Vercel (3 min)

1. Ga naar <https://vercel.com/new>.
2. Je ziet je GitHub-repo's. Klik **Import** naast `customer-survey`.
3. Vercel detecteert automatisch dat het een Node-project is. Scroll naar
   **Environment Variables** en vul deze alvast in (je kunt ze later ook nog
   bijwerken):

   | Naam              | Wat zet je in                                                 |
   |-------------------|---------------------------------------------------------------|
   | `ADMIN_USERNAME`  | `admin`                                                       |
   | `ADMIN_PASSWORD`  | kies een sterk wachtwoord                                     |
   | `SESSION_SECRET`  | een willekeurige lange string (bv. 40 tekens)                 |
   | `CRON_SECRET`     | een andere willekeurige lange string                          |
   | `MAIL_TO`         | `jzahi@machine-learning.company`                              |
   | `MAIL_FROM`       | `onboarding@resend.dev` (voor test — later je eigen adres)    |

   (RESEND_API_KEY en APP_BASE_URL volgen in stap 5 en 6.)

4. Klik **Deploy**. Vercel bouwt je app; dit duurt ~1 minuut.
5. Als het klaar is, krijg je een URL zoals `customer-survey-xyz.vercel.app`.
   Bewaar die even — daar komt je survey straks op te staan.

---

## Stap 4 — Vercel KV database koppelen (2 min)

Dit zorgt ervoor dat contacten en antwoorden bewaard blijven.

1. Ga naar je project in Vercel. Klik tab **Storage**.
2. Klik **Create Database** → kies **KV** (Upstash Redis).
3. Kies de gratis tier, geef hem een naam (bv. `survey-data`), klik **Create**.
4. Vercel vraagt of je 'm aan dit project wilt koppelen — **Connect**.
5. Dit zet automatisch de env-vars `KV_REST_API_URL` en `KV_REST_API_TOKEN` voor
   je klaar. Je hoeft niks handmatig in te typen.
6. Ga naar tab **Deployments** → klik rechtsboven op het drie-puntjes menu van
   de laatste deploy → **Redeploy**. Dit laadt de KV-vars in.

---

## Stap 5 — Resend API key toevoegen (3 min)

1. Log in op <https://resend.com>.
2. Links menu → **API Keys** → **Create API Key**.
3. Naam: `survey-vercel`, Permission: **Sending access**, Domain: laat op
   `All domains`. Klik **Add**.
4. Kopieer de key (begint met `re_...`). Je ziet 'm maar één keer.
5. Terug in Vercel: je project → tab **Settings** → **Environment Variables**.
6. Voeg toe: `RESEND_API_KEY` = de key die je net kopieerde. **Save**.

---

## Stap 6 — App-URL doorgeven aan de app (1 min)

Omdat de survey-links in de mail de URL van je deploy moeten bevatten:

1. In Vercel → **Settings** → **Environment Variables**.
2. Voeg toe: `APP_BASE_URL` = `https://customer-survey-xyz.vercel.app`
   (dat is je Vercel-URL uit stap 3, met `https://` ervoor).
3. **Save**, dan tab **Deployments** → laatste deploy → **Redeploy**.

---

## Stap 7 — Eerste test (2 min)

1. Open `https://jouw-url.vercel.app/admin/login`.
2. Log in met `admin` + je wachtwoord.
3. Tab **Contacten** → voeg jezelf toe (je eigen e-mailadres).
4. Tab **Rondes** → klik **Nieuwe ronde starten**.
5. Check je inbox — er komt binnen een paar minuten een mail van
   `onboarding@resend.dev`.

> **Let op**: bij testen met `onboarding@resend.dev` stuurt Resend gratis
> alleen naar het adres waarmee je je Resend-account hebt aangemaakt. Pas na
> eigen-domein-verificatie (stap 9) kun je naar willekeurige klanten sturen.

6. Klik de link in de mail, vul de survey in.
7. Terug in admin → tab **Overzicht** → je ziet het antwoord, met je naam erbij.

Als dit werkt: je app is live! 🎉

---

## Stap 8 — Automatisch periodiek versturen (1 min)

1. In admin → tab **Instellingen**.
2. Vink aan: **Automatisch periodiek een nieuwe ronde versturen**.
3. Interval: bv. **90** voor elk kwartaal, **30** voor maandelijks, **180** voor
   halfjaarlijks.
4. **Opslaan**.

Vercel Cron draait dagelijks om 09:00 UTC en checkt of het interval verstreken
is sinds de vorige ronde. Zo ja, automatisch start een nieuwe ronde naar alle
actieve contacten.

---

## Stap 9 — Eigen domein gebruiken voor mail-afzender (optioneel, 1 uur)

Zolang je `onboarding@resend.dev` gebruikt kun je niet naar willekeurige
e-mailadressen sturen. Voor echte klanten moet je je eigen domein verifiëren:

1. In Resend → **Domains** → **Add Domain** → `machine-learning.company`.
2. Resend toont een lijst DNS-records (TXT en MX). Je moet ze toevoegen bij je
   DNS-provider (daar waar je je domein hebt geregistreerd — bv. TransIP,
   Versio, Namecheap, Cloudflare).
3. Wacht tot Resend alle records op **Verified** zet (meestal 15 min – 1 uur).
4. Terug in Vercel: zet `MAIL_FROM` op iets als
   `survey@machine-learning.company`. Redeploy.

Als je hulp nodig hebt bij de DNS-records, laat me weten welke provider je
gebruikt — dan loop ik de specifieke stappen door.

---

## Stap 10 — Eigen survey-URL (optioneel, 10 min)

Wil je `survey.machine-learning.company` i.p.v. `customer-survey-xyz.vercel.app`?

1. Vercel project → **Settings** → **Domains** → voer `survey.machine-learning.company` in.
2. Vercel toont een CNAME-record → toevoegen bij je DNS-provider.
3. Wacht ~10 min tot SSL vanzelf is geregeld.
4. Update `APP_BASE_URL` naar de nieuwe URL. Redeploy.

---

## Troubleshooting

**Mail komt niet aan?**
- Kijk in Resend → **Emails** voor verzendlogs. Als er "delivered" staat maar
  je ziet 'm niet: check spam/promoties folder.
- Gebruik je nog `onboarding@resend.dev`? Dan kan alleen je eigen Resend-accountmail
  de mail ontvangen. Voor anderen: verifieer je eigen domein (stap 9).

**Admin login werkt niet?**
- Controleer dat `ADMIN_USERNAME`, `ADMIN_PASSWORD` en `SESSION_SECRET` alle
  drie in Vercel env vars staan. Ga naar **Deployments** → laatste → **Redeploy**.

**Data verdwijnt?**
- Check dat KV is gekoppeld (stap 4) en er een deploy was na het koppelen.
  Vercel → **Settings** → **Environment Variables** moet `KV_REST_API_URL` en
  `KV_REST_API_TOKEN` bevatten.

**Link in mail wijst naar localhost?**
- `APP_BASE_URL` staat niet goed. Zet 'm op `https://jouw-vercel-url` en
  redeploy.

**Cron triggert geen ronde?**
- Controleer dat `autoEnabled` aan staat (tab Instellingen) en dat het interval
  écht verstreken is sinds de laatste ronde. De cron draait maar 1x per dag
  om 09:00 UTC.
