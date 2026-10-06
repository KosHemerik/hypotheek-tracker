# Hypotheek Tracker

Dashboard om meerdere hypotheken (of leningdelen) bij te houden: openstaand bedrag, rentehistorie, betaalde rente en aflossingen, met periodefilter en jaaroverzicht voor de belastingaangifte.

**Stack:** React 19 · Vite 8 · TypeScript (strict) · Tailwind CSS 4 · Recharts 3 · React Router 8 · Vitest 5

## Starten

Vereist Node.js 20.19+ (getest met Node 22).

```bash
npm install
npm run dev        # http://localhost:5173
```

Bij de eerste start wordt er automatisch voorbeelddata geladen: twee leningdelen met rentewijzigingen en een jaar aan betalingen. Op het dashboard verwijdert **"Voorbeelddata wissen"** alleen die voorbeeld-hypotheken. Je eigen hypotheken blijven staan. Met **"Voorbeelddata laden"** zet je ze terug.

| Script                            | Wat het doet                           |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | Ontwikkelserver                        |
| `npm run build`                   | Typecheck + productie-build in `dist/` |
| `npm run preview`                 | Productie-build lokaal bekijken        |
| `npm test` / `npm run test:run`   | Unit tests (watch / eenmalig)          |
| `npm run typecheck`               | Alleen TypeScript controleren          |
| `npm run lint` / `npm run format` | ESLint / Prettier                      |

De data staat voorlopig in je browser: gegevens in `localStorage`, geüploade documenten in IndexedDB (localStorage is te klein voor bestanden). Een andere browser of een gewiste browseropslag betekent dus lege data.

## Opbouw

```
src/
  domain/      types.ts (camelCase, app) · db-types.ts (snake_case, database) · mappers.ts
  data/        MortgageRepository.ts (interface) · LocalStorage… · Supabase… · createRepository.ts
               fileStore.ts (bestanden in IndexedDB)
               DataContext.tsx (state + mutaties) · seed.ts (voorbeelddata)
  lib/         calculations.ts · validation.ts · period.ts · money.ts · dates.ts · format.ts (+ tests)
  components/  ui/ · charts/ · mortgage/ · payments/ · rates/ · PeriodFilter · YearOverview
  pages/       DashboardPage · MortgageDetailPage
supabase/migrations/   SQL-schema
```

**Uitgangspunten**

- **De UI praat alleen via `MortgageRepository`** met data. Welke implementatie gebruikt wordt, staat op één plek: `src/data/createRepository.ts`.
- **Bedragen zijn gehele centen.** Rente staat in duizendsten van een procent (3,85% = `3850`). Daardoor ontstaan er geen afrondingsfouten. Afronden gebeurt alleen bij de theoretische rente, en dan half naar boven op hele centen.
- **Datums zijn ISO-strings** (`YYYY-MM-DD`), net als Postgres `date`. Dat voorkomt tijdzoneproblemen.
- **Alle berekeningen en validaties zijn pure functies** in `src/lib/` en hebben unit tests.
- **Het periodefilter staat in de URL** (`?periode=1J`, `?periode=2025`) en blijft behouden als je tussen pagina's wisselt.

**Gedrag dat goed is om te weten**

- **Geldend rentepercentage op een datum:** het percentage met de laatste ingangsdatum op of vóór die datum.
- **Eerste rentepercentage:** dit valt altijd op de startdatum. Je kunt het niet verwijderen of verplaatsen. Pas je de startdatum van een hypotheek aan, dan schuift dit percentage automatisch mee.
- **Openstaand bij een periodefilter:** het saldo aan het eind van de periode, of vandaag als de periode tot nu loopt. Betaalde rente en aflossing gelden voor de gekozen periode, met het totaal eronder.
- **Theoretische rente:** het openstaande bedrag aan het begin van de maand × het geldende percentage / 12. Dit is een indicatie. In de grafiek staat die als lijn naast de werkelijk betaalde rente.
- **Maximale aflossing:** een aflossing mag het saldo nooit onder € 0 brengen, ook niet als je een betaling achteraf invoegt of bewerkt. De foutmelding noemt het maximaal mogelijke bedrag.
- **Documenten:** op de detailpagina kun je bestanden uploaden door ze te slepen of te kiezen (max. 20 MB per bestand, 10 per keer). De categorie (offerte, akte, taxatierapport, jaaroverzicht, rentewijziging, overig) wordt geraden uit de bestandsnaam en is aan te passen. PDF's en afbeeldingen openen in een nieuw tabblad; andere bestanden worden gedownload. Verwijder je een hypotheek, dan gaan de documenten mee.

## Supabase koppelen

Alles is al voorbereid: `SupabaseMortgageRepository` implementeert dezelfde interface, `@supabase/supabase-js` is geïnstalleerd en de SQL-migratie staat klaar. Zonder env-variabelen blijft de app localStorage gebruiken, en zit de Supabase-code ook niet in de bundel.

### 1. Project en schema

1. Maak een project aan op [supabase.com](https://supabase.com).
2. Voer de migraties in `supabase/migrations/` op volgorde uit in de **SQL Editor**: eerst `…_init.sql`, dan `…_documents.sql`. De tweede maakt ook de private Storage-bucket `mortgage-documents` aan, met policies. Met de CLI kan het ook: `supabase link` en daarna `supabase db push`.

### 2. Omgevingsvariabelen

```bash
cp .env.example .env.local
```

Vul daarin `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` in. Die vind je in Supabase onder Project Settings → API. Vanaf dat moment kiest `createRepository()` automatisch Supabase.

### 3. Inloggen toevoegen (nodig voor RLS)

Row Level Security laat alleen rijen zien waarvan `user_id = auth.uid()`. Zonder ingelogde gebruiker zie je dus niets en mislukken inserts. Dit moet je nog bouwen:

1. Zet in Supabase onder **Authentication → Providers** bijvoorbeeld _Email (magic link)_ aan.
2. Maak één gedeelde client, bijvoorbeeld in `src/data/supabaseClient.ts`, en gebruik die zowel in `createRepository.ts` als voor auth.
3. Voeg een loginscherm toe met `supabase.auth.signInWithOtp({ email })`. Render `<DataProvider>` pas als er een sessie is (`supabase.auth.getSession()` / `onAuthStateChange`), en laad de data opnieuw na het in- of uitloggen.
4. `user_id` hoef je niet mee te sturen. De database vult die zelf via `default auth.uid()`.

### 4. Bestaande localStorage-data overzetten (optioneel)

Na het inloggen kun je eenmalig alles overzetten. Lees de rijen via `new LocalStorageMortgageRepository()` en maak ze aan via de Supabase-repository. Let op: nieuwe hypotheken krijgen een nieuw id, dus zet `mortgage_id` om. Een alternatief is de voorbeelddata opnieuw laden met de knop. `seed.ts` werkt via de interface en dus ook met Supabase.

### Schema in het kort

| Tabel                   | Belangrijkste kolommen                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mortgages`             | `id uuid pk`, `user_id → auth.users`, `name`, `mortgage_number`, `principal_cents bigint`, `start_date`, `end_date`, `notes`, `created_at`, `updated_at`    |
| `interest_rate_periods` | `id`, `user_id`, `mortgage_id → mortgages on delete cascade`, `rate_percentage numeric(6,3)`, `effective_date`; uniek per (`mortgage_id`, `effective_date`) |
| `payments`              | `id`, `user_id`, `mortgage_id → mortgages on delete cascade`, `payment_date`, `interest_cents`, `principal_cents`, `description`                            |
| `mortgage_documents`    | `id`, `user_id`, `mortgage_id → mortgages on delete cascade`, `file_name`, `mime_type`, `size_bytes`, `category`, `description`, `storage_path`             |

Het schema bevat:

- **Check-constraints:** bedragen ≥ 0, een betaling heeft rente of aflossing > 0, en de einddatum ligt na de startdatum.
- **Indexes** op `mortgage_id` en `user_id`.
- **Een trigger** die `updated_at` bijwerkt.
- **RLS-policies per gebruiker voor select, insert, update en delete.** Bij rentewijzigingen en betalingen controleert de insert/update-policy ook dat de bijbehorende hypotheek van dezelfde gebruiker is.

**Documenten:** de metadata staat in `mortgage_documents`, de bestanden zelf in de private Storage-bucket `mortgage-documents`. Het pad is `<user_id>/<mortgage_id>/<document_id>/<bestandsnaam>`. De Storage-policies controleren dat de eerste map je eigen user id is. Bestanden in Storage verdwijnen niet vanzelf mee met een `on delete cascade`. Daarom ruimt `SupabaseMortgageRepository.deleteMortgage` ze eerst zelf op. Maximaal 20 MB per bestand; dat wordt in de app, de tabel én de bucket afgedwongen.

De vertaling tussen de database (snake_case, `rate_percentage` als decimaal) en de app (camelCase, centen, duizendsten procent) gebeurt in `src/domain/mappers.ts`.

> Regels die over meerdere rijen gaan, zoals "aflossing mag het saldo niet onder 0 brengen" en "het eerste percentage valt op de startdatum", controleert de app in `lib/validation.ts`. Wil je die ook in de database afdwingen, dan kan dat later met een trigger of een RPC-functie.
