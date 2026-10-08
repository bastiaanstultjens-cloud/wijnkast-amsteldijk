# Wijnkast Amsteldijk

Overzicht van de MOA-wijnklimaatkast (28 flessen, 2 zones): wat ligt waar, hoe lang al, wanneer drinken, waar het bij past en wat het waard is. Plus een logboek van geopende flessen en suggesties voor vanavond, eventueel met hulp van Claude.

## Snel starten (lokaal, zonder accounts)

```bash
cd wijnkast
python3 -m http.server 8000
```

Open http://localhost:8000. De kast wordt dan in je browser bewaard. Handig om te proberen, maar niet gedeeld met Vivian of je telefoon.

## Online zetten en delen

Je hebt drie dingen nodig: een GitHub-repo, Supabase (gratis) voor de opslag en Vercel (gratis) voor de hosting.

### 1. Supabase
1. Maak een project op [supabase.com](https://supabase.com).
2. Open **SQL Editor**, plak `supabase/schema.sql`, vervang onderaan het e-mailadres van Vivian en klik **Run**.
3. Kopieer uit **Project Settings → API** de **Project URL** en de **anon public key** naar `config.js`.

### 2. GitHub
Zet deze map in een nieuwe repo (Claude Code kan dat voor je doen: "maak hier een git-repo van en push naar GitHub").

### 3. Vercel
1. Importeer de repo op [vercel.com/new](https://vercel.com/new). Geen framework, geen build-instellingen nodig.
2. Voeg bij **Settings → Environment Variables** toe:
   - `ANTHROPIC_API_KEY` — je sleutel van [console.anthropic.com](https://console.anthropic.com) (voor etiket scannen, aanvullen, prijs opzoeken en "Vanavond"). Zet in de Console webzoeken aan voor je organisatie als dat uit staat. Kosten: ongeveer 5 cent per fles voor het webzoeken plus de tokens.
   - optioneel `SUPABASE_URL` en `SUPABASE_ANON_KEY` — alleen nodig als je een ander Supabase-project gebruikt dan in `api/claude.js` staat
   - optioneel `ANTHROPIC_MODEL` (standaard `claude-sonnet-5-5`)
3. Deploy.

### 4. Accounts
In Supabase: **Authentication → Users → Add user → Create new user**. Vul e-mailadres en wachtwoord in en zet **Auto Confirm User** aan. Doe dit voor jezelf en voor Vivian. Daarna log je op de site in met e-mail en wachtwoord; je blijft ingelogd op dat apparaat.

Zet de site op je telefoon via **Deel → Zet op beginscherm**, dan opent hij als een app.

## Data verhuizen
Op het tabblad **Lijst** staat onderaan **Back-up downloaden** en **Back-up terugzetten** (JSON). Daarmee neem je flessen en logboek mee van lokaal naar Supabase, of andersom.

## Verder bouwen met Claude Code
Open deze map in Claude Code. `CLAUDE.md` beschrijft de kast-indeling, het datamodel en de opbouw, zodat Claude direct weet hoe alles in elkaar zit.
