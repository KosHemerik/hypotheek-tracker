# Hypotheek Tracker

Dashboard om meerdere hypotheken (of leningdelen) bij te houden: openstaand bedrag, rentehistorie, betaalde rente en aflossingen, met periodefilter en jaaroverzicht voor de belastingaangifte.

**Stack:** React 19 · Vite 8 · TypeScript (strict) · Tailwind CSS 4 · Recharts 3 · React Router 8 · Vitest 5

## Starten

Vereist Node.js 20.19+ (getest met Node 22).

```bash
npm install
npm run dev        # https://localhost:5173
```

Bij de eerste start wordt er automatisch voorbeelddata geladen: twee leningdelen met rentewijzigingen en een jaar aan betalingen. Op het dashboard verwijdert **"Voorbeelddata wissen"** alleen die voorbeeld-hypotheken. Je eigen hypotheken blijven staan. Met **"Voorbeelddata laden"** zet je ze terug.

De dev-server draait op **`https://localhost:5173`**, altijd op die poort, omdat de bank na het koppelen naar `https://localhost:5173/bank/callback` terugstuurt. Hij gebruikt het certificaat in `secrets/localhost-cert.pem`, dat niet in git staat. Je browser waarschuwt eenmalig. Die waarschuwing verdwijnt als je het certificaat vertrouwt:

```bash
security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db secrets/localhost-cert.pem
```

Een nieuw certificaat maken, bijvoorbeeld op een andere computer:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 397 -keyout secrets/localhost-key.pem -out secrets/localhost-cert.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" -addext "basicConstraints=critical,CA:FALSE" -addext "keyUsage=critical,digitalSignature,keyEncipherment" -addext "extendedKeyUsage=serverAuth"
```

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
  auth/        supabaseClient.ts · AuthContext.tsx (sessie) · authErrors.ts
  data/        MortgageRepository.ts (interface) · LocalStorage… · Supabase… · createRepository.ts
               fileStore.ts (bestanden in IndexedDB)
               DataContext.tsx (state + mutaties) · seed.ts (voorbeelddata)
  lib/         calculations.ts · validation.ts · period.ts · money.ts · dates.ts · format.ts (+ tests)
  components/  ui/ · charts/ · mortgage/ · payments/ · rates/ · PeriodFilter · YearOverview
  pages/       DashboardPage · MortgageDetailPage · LoginPage
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
- **Leningdelen:** een hypotheek bestaat uit één of meer leningdelen, elk met een eigen bedrag, eigen rentehistorie en een **afgesproken aflossing per maand** (€ 0 = aflossingsvrij of niets afgesproken). Bij "Hypotheek toevoegen" voeg je meerdere delen toe; daarna beheer je ze in de sectie Leningdelen op de detailpagina. Een betaling heeft per deel rente en aflossing. Bij een nieuwe betaling wordt de afgesproken aflossing al ingevuld. De rentecontrole rekent per deel met het eigen saldo en de eigen rente. Een betaling met rente sluit de renteperiode voor álle delen af, dus een vergeten deel valt meteen op als "te weinig". Op kaarten en kerncijfers zie je bij meerdere delen de gemiddelde rente (gewogen naar het saldo) en de bandbreedte.
- **Renteberekening per hypotheek:** bij Hypotheek bewerken kies je **Werkelijke dagen** (rente per dag tot de betaaldag) of **30/360 met vervaldag** (elke maand telt als 30 dagen, renteperiodes tot en met bijvoorbeeld de 25e). Veel geldverstrekkers, zoals Build Finance, rekenen met 30/360. De rentecontrole, het betaalformulier en het verwerken van banktransacties volgen de gekozen methode.
- **Archiveren:** een afgeloste of beëindigde lening archiveer je via de knop "Archiveren" onderaan de pagina van die lening, en terugzetten doe je met "Dearchiveren". Er gaat niets verloren. Op het dashboard wissel je tussen **Actief** en **Gearchiveerd**; kaarten, totalen, grafiek en jaaroverzicht volgen de gekozen weergave.
- **Entiteiten:** met het keuzemenu in de bovenbalk kies je een entiteit, zoals K.B. Hemerik, Stevig Vastgoed B.V. of Basko B.V. Je ziet dan alleen de hypotheken, betalingen, documenten en totalen van die entiteit. Via hetzelfde menu voeg je entiteiten toe of beheer je ze. Verwijderen kan alleen als er geen hypotheken meer onder vallen. Bij "Hypotheek bewerken" kun je een lening naar een andere entiteit verplaatsen. De laatst gekozen entiteit wordt per browser onthouden.
- **Documenten:** op de detailpagina kun je bestanden uploaden door ze te slepen of te kiezen (max. 20 MB per bestand, 10 per keer). De categorie (offerte, akte, taxatierapport, jaaroverzicht, rentewijziging, overig) wordt geraden uit de bestandsnaam en is aan te passen. PDF's en afbeeldingen openen in een nieuw tabblad; andere bestanden worden gedownload. Verwijder je een hypotheek, dan gaan de documenten mee.

## Bankkoppeling (Enable Banking)

Per entiteit kun je één bankrekening koppelen, bij de **Rabobank** of **ING**. Bij het koppelen kies je zelf de bank. De koppeling is **alleen lezen**: saldo en transacties. Dit werkt alleen online (met Supabase), niet in de lokale modus.

**Hoe het werkt**

- **Rekeningnummer per hypotheek:** vul bij de hypotheek het **rekeningnummer (IBAN) van de geldverstrekker** in, via Hypotheek bewerken.
- **Banktransacties:** op de detailpagina staan in de sectie "Banktransacties" alleen afschrijvingen naar dat rekeningnummer, oudste eerst.
- **Per transactie kies je:**
  - **Rente** of **Aflossing**: het hele bedrag wordt in één klik een betaling.
  - **Verdelen…**: het betaalformulier opent vooraf ingevuld met de verschuldigde rente en de aflossing, en toont het verschil met het bankbedrag.
  - **Archiveren**: de transactie verdwijnt uit de lijst en is terug te zetten onder "Gearchiveerd".
- **Pas na goedkeuring:** een transactie wordt pas een betaling als je hem goedkeurt. Verwijder je die betaling later, dan staat de transactie weer bij "Te verwerken".
- **Toestemming:** die geldt maximaal 180 dagen. De bankkaart op het overzicht waarschuwt 14 dagen van tevoren en heeft een knop "Toestemming verlengen".

**Beveiliging**

- **Sleutel alleen op de server:** de Enable Banking-sleutel staat alleen als secret in de Supabase Edge Function `bank` (`supabase/functions/bank`), nooit in de browser of in git.
- **Inloggen verplicht:** de functie controleert de login van de gebruiker en werkt met díens rechten, dus RLS blijft gelden.
- **Wachtwoord nooit in de app:** je logt in bij de bank zelf.

**Eenmalig instellen**

1. Maak een account op [enablebanking.com](https://enablebanking.com) en ga naar het Control Panel.
2. Registreer een applicatie voor **Production** en laat de sleutel in de browser genereren. Je krijgt dan een `.pem`-bestand; de bestandsnaam is het **application id**.
3. Zet bij de toegestane redirect-URL's: `https://localhost:5173/bank/callback`, en later het adres waar de app online staat, gevolgd door `/bank/callback`.
4. Kies **"Activate by linking accounts"** en koppel je eigen rekeningen bij elke bank die je wilt gebruiken (privé en zakelijk). In deze gratis, beperkte modus kan de app alleen die rekeningen lezen.
5. Zet de sleutel in Supabase. Bewaar het `.pem`-bestand in de map `secrets/`, die in `.gitignore` staat, en voer uit:

   ```bash
   set -a; source .env.supabase; set +a
   supabase secrets set ENABLE_BANKING_APP_ID=<application id> \
     ENABLE_BANKING_PRIVATE_KEY="$(cat secrets/<application id>.pem)"
   ```

6. Na wijzigingen aan de functie: `supabase functions deploy bank --use-api --no-verify-jwt`. De functie controleert de login zelf.

## Supabase koppelen en inloggen

De app is klaar voor Supabase. Er is een inlogscherm met e-mail en wachtwoord, en de data loopt via `SupabaseMortgageRepository`. Zonder env-variabelen draait de app in **lokale modus**: data alleen in je browser en geen login. Dat is te zien aan het label "Lokale modus" in de header.

### Huidige koppeling

Deze map is gekoppeld aan het Supabase-project **hypotheek-tracker** (ref `fbuwzvincpugaligbmzr`, regio Stockholm). De volgende stappen zijn al gedaan: schema en migraties uitgevoerd, registratie uitgezet en `.env.local` ingevuld. Alleen **je eigen account aanmaken** (stap 3) moet je nog zelf doen.

- `.env.local` bevat de projecturl en de publieke (publishable) sleutel. Die zijn veilig in de frontend.
- `.env.supabase` bevat een access token (`SUPABASE_ACCESS_TOKEN`) van het juiste Supabase-account. Daarmee werkt de CLI in deze map, los van een eventuele globale `supabase login`. Beide bestanden staan in `.gitignore`.
- Een nieuwe migratie toevoegen en uitvoeren:

  ```bash
  supabase migration new <naam>          # maakt supabase/migrations/<tijd>_<naam>.sql
  set -a; source .env.supabase; set +a   # token van het juiste account laden
  supabase db push
  ```

### 1. Project en schema

1. Maak een project aan op [supabase.com](https://supabase.com).
2. Voer de migraties in `supabase/migrations/` op volgorde uit in de **SQL Editor**: eerst `…_init.sql`, dan `…_documents.sql`, `…_entities.sql`, `…_loan_parts.sql`, `…_bank.sql`, `…_archive_mortgages.sql` en `…_interest_method.sql`. De tweede maakt ook de private Storage-bucket `mortgage-documents` aan, met policies. Met de CLI kan het ook: `supabase link` en daarna `supabase db push`.

### 2. Registratie uitzetten (belangrijk)

De app heeft geen registratiescherm, maar dat alleen beveiligt niets: zolang registratie in Supabase aanstaat, kan iedereen met de (publieke) anon key via de API een account aanmaken. Zet het daarom uit:

- **Authentication → Sign In / Providers**: zet **"Allow new users to sign up"** uit.
- Laat de provider **Email** aan staan, anders kun je zelf ook niet inloggen.

Ook als iemand toch een account zou hebben, ziet die door Row Level Security nooit jouw data: elke tabel en de Storage-bucket filteren op `auth.uid()`.

### 3. Je eigen account aanmaken (eenmalig)

1. Ga naar **Authentication → Users → Add user → Create new user**.
2. Vul je e-mailadres en een sterk wachtwoord in en vink **"Auto Confirm User"** aan. Dan hoef je geen bevestigingsmail te openen.
3. Optioneel, onder **Authentication → Sign In / Providers → Email**: verhoog de minimale wachtwoordlengte en zet _leaked password protection_ aan.

Wachtwoord vergeten? Stel een nieuw wachtwoord in via **Authentication → Users → (jouw account) → Send password recovery**, of verwijder de gebruiker en maak hem opnieuw aan. De `user_id` verandert dan wel, waardoor je bestaande data niet meer bij het nieuwe account hoort. Gebruik dus liever de recovery-optie.

### 4. Omgevingsvariabelen

```bash
cp .env.example .env.local
```

Vul daarin `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` in. Die vind je onder **Project Settings → API**. Herstart daarna `npm run dev`; je ziet nu het inlogscherm. De anon key mag publiek zijn: hij geeft zonder ingelogde sessie geen toegang tot data.

### Hoe de beveiliging werkt

- **Inlogscherm als toegangspoort:** zonder geldige sessie rendert de app alleen het inlogscherm. Pas na inloggen worden de data-laag en de pagina's aangemaakt. De URL blijft staan, zodat je na het inloggen op de pagina komt die je opende.
- **Sessie:** supabase-js bewaart de sessie in de browser en ververst het token automatisch. Verloopt of vervalt de sessie, dan ga je terug naar het inlogscherm.
- **Uitloggen:** verwijdert de sessie uit deze browser. Bij een andere gebruiker begint de data-state helemaal opnieuw.
- **Database en Storage:** RLS-policies staan per gebruiker op alle tabellen en op de Storage-bucket. `user_id` wordt door de database zelf gevuld (`default auth.uid()`).
- **Voorbeelddata:** wordt met Supabase nooit automatisch geladen. Alleen als je database leeg is, krijg je de knop "Voorbeelddata laden" aangeboden.

Code: [`src/auth/`](src/auth) (client, sessie, foutmeldingen) en [`src/pages/LoginPage.tsx`](src/pages/LoginPage.tsx).

### 5. Bestaande localStorage-data overzetten (optioneel)

Na het inloggen kun je eenmalig alles overzetten. Lees de rijen via `new LocalStorageMortgageRepository()` en maak ze aan via de Supabase-repository. Let op: nieuwe hypotheken krijgen een nieuw id, dus zet `mortgage_id` om. Een alternatief is de voorbeelddata opnieuw laden met de knop. `seed.ts` werkt via de interface en dus ook met Supabase.

### Schema in het kort

| Tabel                   | Belangrijkste kolommen                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`              | `id`, `user_id`, `name` (uniek per gebruiker)                                                                                                                                                                                         |
| `loan_parts`            | `id`, `user_id`, `mortgage_id → mortgages on delete cascade`, `name` (uniek per hypotheek), `principal_cents`, `agreed_repayment_cents`                                                                                               |
| `payment_lines`         | `id`, `user_id`, `(payment_id, mortgage_id) → payments`, `(loan_part_id, mortgage_id) → loan_parts`, `interest_cents`, `principal_cents`                                                                                              |
| `bank_connections`      | per entiteit één koppeling: `entity_id` (uniek), `status`, `psu_type`, `iban`, `valid_until`, `balance_cents`, sessiegegevens van de bank                                                                                             |
| `bank_transactions`     | `connection_id`, `entity_id`, `external_id` (uniek per koppeling), `booking_date`, `amount_cents` (negatief = afschrijving), `counterparty_iban`, `description`, `payment_id → payments on delete set null`, `ignored` (gearchiveerd) |
| `mortgages`             | `id uuid pk`, `user_id → auth.users`, `name`, `mortgage_number`, `entity_id → entities on delete restrict`, `counterparty_iban` (IBAN geldverstrekker), `start_date`, `end_date`, `notes`, `created_at`, `updated_at`                 |
| `interest_rate_periods` | `id`, `user_id`, `mortgage_id`, `(loan_part_id, mortgage_id) → loan_parts on delete cascade`, `rate_percentage numeric(6,3)`, `effective_date`; uniek per (`loan_part_id`, `effective_date`)                                          |
| `payments`              | `id`, `user_id`, `mortgage_id → mortgages on delete cascade`, `payment_date`, `description` (bedragen staan in `payment_lines`)                                                                                                       |
| `mortgage_documents`    | `id`, `user_id`, `mortgage_id → mortgages on delete cascade`, `file_name`, `mime_type`, `size_bytes`, `category`, `description`, `storage_path`                                                                                       |

Het schema bevat:

- **Check-constraints:** bedragen ≥ 0, een betaling heeft rente of aflossing > 0, en de einddatum ligt na de startdatum.
- **Indexes** op `mortgage_id` en `user_id`.
- **Een trigger** die `updated_at` bijwerkt.
- **RLS-policies per gebruiker voor select, insert, update en delete.** Bij rentewijzigingen en betalingen controleert de insert/update-policy ook dat de bijbehorende hypotheek van dezelfde gebruiker is.

**Documenten:** de metadata staat in `mortgage_documents`, de bestanden zelf in de private Storage-bucket `mortgage-documents`. Het pad is `<user_id>/<mortgage_id>/<document_id>/<bestandsnaam>`. De Storage-policies controleren dat de eerste map je eigen user id is. Bestanden in Storage verdwijnen niet vanzelf mee met een `on delete cascade`. Daarom ruimt `SupabaseMortgageRepository.deleteMortgage` ze eerst zelf op. Maximaal 20 MB per bestand; dat wordt in de app, de tabel én de bucket afgedwongen.

**Opslaan in één transactie:** de database-functies `create_mortgage`, `create_loan_part` en `save_payment` slaan een hypotheek met delen, een nieuw deel met startrente en een betaling met regels in één keer op (security invoker, dus RLS blijft gelden). Anonieme gebruikers mogen ze niet aanroepen.

De vertaling tussen de database (snake_case, `rate_percentage` als decimaal) en de app (camelCase, centen, duizendsten procent) gebeurt in `src/domain/mappers.ts`.

> Regels die over meerdere rijen gaan, zoals "aflossing mag het saldo niet onder 0 brengen" en "het eerste percentage valt op de startdatum", controleert de app in `lib/validation.ts`. Wil je die ook in de database afdwingen, dan kan dat later met een trigger of een RPC-functie.
