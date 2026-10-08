# Wijnkast Amsteldijk

Webapp om de wijnklimaatkast van Bastiaan en Vivian (Amsteldijk 64-1, Amsterdam) bij te houden.
Alle tekst in de app is **Nederlands**. Houd dat zo, ook in foutmeldingen en knoppen.

## De kast
MOA wijnkoelkast, 28 flessen, 2 koelzones (5–18 °C), 6 uitschuifbare houten planken + 1 metalen lade.
- Plekcodes: plank `1`–`6` (van boven naar beneden) + `L` (lade), kolommen `A`–`D` → `1A` … `6D`, `LA` … `LD`.
- Zone boven = plank 1–3 (12 flessen). Zone onder = plank 4–6 + lade (16 flessen).
- Dit staat in `ROWS`/`COLS` bovenaan `js/app.js`. Verandert de indeling, pas het daar aan.

## Opbouw
Bewust zonder build-stap: gewone HTML/CSS/JS, direct te hosten (Vercel, GitHub Pages).

| Bestand | Rol |
|---|---|
| `index.html` | Pagina-skelet, laadt alles in volgorde: config → supabase-js (CDN) → store → ai → app |
| `styles.css` | Alle stijlen. Kleuren als tokens op `:root`, met donkere variant via `prefers-color-scheme` |
| `config.js` | Supabase URL + anon key. Leeg = lokale modus (localStorage) |
| `js/store.js` | Opslaglaag `window.store` met twee implementaties: `local` en `supabase`. Zelfde API |
| `js/ai.js` | `window.ai`: praat met `/api/claude`. `ai.init()` geeft `null` als die er niet is |
| `js/app.js` | De app zelf: rendering (template strings), formulieren, drinkstatus, pairing |
| `api/claude.js` | Vercel serverless function die de Anthropic API aanroept (sleutel blijft op de server) |
| `supabase/schema.sql` | Tabel, RLS-regels, realtime, opslagbucket voor etiketfoto's |

### store-API (`window.store`)
`init()`, `needsLogin()`, `signIn(email, password)`, `signOut()`, `newId()`,
`set(col,id,data)`, `update(col,id,patch)`, `remove(col,id)`,
`watch(col, cb(list))`, `watchDoc(col,id, cb(data|null))`,
`uploadPhoto(file) → ref`, `photoUrl(ref)`, `exportAll()`, `importAll(data)`, `authToken()`.
`watch` roept de callback opnieuw aan na elke wijziging (lokaal én via Supabase realtime).

## Datamodel
Documenten per collectie (in Supabase: tabel `docs(collection, id, data jsonb)`).

**`bottles/<id>`** — één fysieke fles. Meerdere flessen van dezelfde wijn = meerdere documenten.
- Fles: `producer`, `cuvee`, `vintage` (jaartal of `"NV"`), `type` (`rood|wit|rose|champagne|mousserend|zoet|versterkt`), `size` (`"75 cl"` …), `abv`
- Mousserend: `disgorged`, `dosage`
- Herkomst: `country`, `region`, `appellation`, `grapes`
- Drinkvenster: `drinkFrom`, `drinkPeak`, `drinkTo` (jaartallen), `windowSource`
- Serveren: `serveTemp`, `decant` (`ja|nee|optioneel`), `decantMin`, `glass`
- `pairing` (vrije tekst, komma-gescheiden gerechten)
- Aankoop: `purchaseDate`, `shop`, `price`, `marketValue`, `giftFrom`, `reservedFor`
- Beoordeling: `criticScore` (tekst), `myScore` (0–100), `notes`
- Overig: `lwin`, `addedAt` (datum in de kast), `slot` (plekcode, of leeg = buiten de kast), `photo` (opslagref)
- Webinfo: `sources` (`[{url,title}]`), `valueCheckedAt` (datum van laatste prijscheck). Bij bewerken blijven velden die niet in het formulier staan behouden.

**`log/<id>`** — een geopende fles: kopie van de wijnvelden + `openedOn`, `with`, `dish`, `occasion`, `pairingScore` (1–5), `myScore`, `tasting`, `bottleId`. Bij "Geopend" wordt de fles uit `bottles` verwijderd.

**`settings/kast`** — `{ top, bottom }` zonetemperaturen in °C.

## Logica die je moet kennen
- `status(b)` in `app.js` bepaalt de drinkstatus uit het venster t.o.v. het huidige jaar:
  `over` > venster voorbij, `haast` = laatste jaar(en), `piek`, `klaar`, `jong`, `onbekend`. `URG` geeft de sorteervolgorde.
- `DISHES` + `dishScore()` = de lokale pairing-suggesties op het tabblad Vanavond (trefwoorden in `pairing` + type-affiniteit + urgentie).
- Etiket scannen: knop "Foto" (header) of "Foto van etiket" in het formulier → `scanLabel()` verkleint de foto, stuurt hem als data-URL naar `/api/claude` en vult het formulier via `fillForm()` (alleen lege velden of standaardwaarden). De foto wordt ook de etiketfoto van de fles.
- Webzoeken: `/api/claude` met `web:true` geeft Claude de web search tool (max. 5 zoekopdrachten, locatie NL) en geeft `sources` terug; `ai.json()` levert die als `_sources`. Gebruikt door scannen, aanvullen en de knop "Prijs en scores opzoeken" (`refreshFromWeb()`). Vivino heeft geen officiële API; niet scrapen, Claude leest Vivino-pagina's via webzoeken.
- Claude-prompts staan in `enrich()` (fles aanvullen; vult alleen lege velden) en `askClaude()` (keuze voor vanavond). Beide verwachten JSON terug.

## Inloggen
E-mail + wachtwoord (`signInWithPassword`), geen inlogmails: het gratis Supabase-plan verstuurt maar een paar mails per uur.
Accounts maak je in Supabase onder Authentication → Users → Add user → Create new user, met **Auto Confirm User** aan.
Wie de kast mag zien staat los daarvan in de tabel `allowed_users` (zie `supabase/schema.sql`).

## Lokaal draaien
- Alleen front-end: `npx serve .` of `python3 -m http.server`, open http://localhost:3000 of :8000. Claude-knoppen zijn dan verborgen.
- Met de Claude-functie: `npx vercel dev` met `ANTHROPIC_API_KEY` in `.env.local`.

## Afspraken
- Geen framework of bundler toevoegen zonder reden; de app moet als losse bestanden blijven werken.
- Gebruikersinvoer altijd via `h()` escapen in templates.
- Nieuwe velden: toevoegen aan `GROUPS` (formulier) en aan `openDetail()` (weergave), en hier in het datamodel.
- Na wijzigingen: test toevoegen, verplaatsen, openen (logboek) en de back-up in lokale modus.
