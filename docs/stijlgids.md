# Stijlgids – rustig dashboard

De visuele stijl van de Hypotheek Tracker, uitgeschreven om in een andere app te hergebruiken. Gebouwd met **React + Tailwind CSS v4**. Alle klassen hieronder zijn letterlijk overgenomen uit de app.

> **Snel starten in een nieuw project:** kopieer `src/index.css` en de map `src/components/ui/` (`Button`, `Card`, `Field`, `Modal`, `icons`). Daarmee heb je alle bouwstenen. De rest van dit document legt uit hoe je ze gebruikt en waarom ze zo zijn.

---

## 1. Principes

1. **Licht en rustig.** Lichtgrijze achtergrond (`slate-50`), witte vlakken, veel lucht. Geen kleurvlakken voor de sier.
2. **Eén accentkleur: bijna-zwart.** Primaire knoppen, actieve keuzes en focusranden zijn `slate-900`. Kleur (groen, rood, oranje, blauw) betekent altijd iets: status of een gegevensreeks.
3. **Randen, geen schaduwen.** Vlakken krijgen een dunne rand van 1px (`ring-1 ring-slate-200`). Schaduw alleen voor wat boven de pagina zweeft: menu's, tooltips en de geselecteerde optie in een schakelaar.
4. **Getallen zijn de held.** Bedragen staan groot en `font-semibold`, altijd met vaste cijferbreedte (`.tabular`), zodat kolommen netjes uitlijnen.
5. **Weinig lettergroottes.** Bijna alles is `text-sm` (14px). Groot alleen voor paginatitels en kerncijfers.
6. **Mobiel eerst, zonder concessies.** Alles werkt op 390px breed: grids klappen in, tabellen scrollen binnen hun kaart, modals worden een sheet vanaf onderen.
7. **Zeg wat er is en wat je kunt doen.** Lege staten leggen uit en bieden een actie aan. Foutmeldingen zeggen wat er mis is en hoe het wel moet.

---

## 2. Basis (`index.css`)

```css
@import 'tailwindcss';

@theme {
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* Kleuren voor gegevens (grafieken), niet voor de interface. */
  --color-principal: #2a78d6; /* blauw  – reeks 1 */
  --color-interest: #eb6834; /* oranje – reeks 2 */
  --color-theoretical: #52514e; /* grijs  – vergelijkingslijn */
}

@layer base {
  html {
    -webkit-text-size-adjust: 100%;
  }
  body {
    @apply bg-slate-50 text-slate-900 antialiased;
  }
  /* Getallen met vaste breedte: gebruik op bedragen, datums, tabellen. */
  .tabular {
    font-variant-numeric: tabular-nums;
  }
}

/* Achtergrond van modals (native <dialog>). */
dialog::backdrop {
  background: rgb(15 23 42 / 0.4);
  backdrop-filter: blur(2px);
}
```

**Lettertype:** "Inter" staat in de stack, maar wordt in deze app niet geladen. Wat je ziet is het systeemlettertype (SF Pro op Mac/iOS, Segoe UI op Windows). Dat oogt strak en laadt direct. Wil je op elk apparaat exact hetzelfde, laad Inter dan wel, bijvoorbeeld via Google Fonts (`wght@400;500;600`).

---

## 3. Kleuren

### Neutraal (de hele interface)

| Rol               | Klasse                                  | Gebruik                                                          |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Paginaachtergrond | `bg-slate-50`                           | body                                                             |
| Vlak              | `bg-white`                              | kaarten, modals, invoervelden, header                            |
| Subtiel vlak      | `bg-slate-50` / `bg-slate-100`          | hover, uitlegblokjes, schakelaar-achtergrond (`bg-slate-200/60`) |
| Rand kaart        | `ring-slate-200`                        | kaarten, menu's                                                  |
| Rand invoer       | `ring-slate-300`                        | invoervelden, secundaire knoppen                                 |
| Scheidingslijn    | `border-slate-100` / `divide-slate-100` | binnen kaarten, tabelrijen                                       |
| Tekst primair     | `text-slate-900`                        | titels, waarden                                                  |
| Tekst secundair   | `text-slate-600` / `text-slate-700`     | bodytekst, labels                                                |
| Tekst gedempt     | `text-slate-500`                        | toelichting, kolomkoppen, hints                                  |
| Tekst heel licht  | `text-slate-400` / `text-slate-300`     | "—" voor leeg, optionele labels                                  |
| Accent / primair  | `bg-slate-900`                          | primaire knop, actieve rand, logo-blokje                         |

### Status (altijd met icoon of tekst, nooit alleen kleur)

| Betekenis                   | Tekst                                     | Achtergrond + rand           |
| --------------------------- | ----------------------------------------- | ---------------------------- |
| Goed / klopt                | `text-emerald-700`                        | –                            |
| Fout / te weinig            | `text-red-700` (meldingen `text-red-600`) | `bg-red-50 ring-red-200`     |
| Let op / te veel / verloopt | `text-amber-700` / `text-amber-800`       | `bg-amber-50 ring-amber-200` |
| Info / huidig               | `text-blue-700`                           | `bg-blue-50`                 |
| Gevaarlijke actie           | `bg-red-600 hover:bg-red-500` (knop)      | –                            |

### Gegevens (grafieken)

Blauw `#2a78d6` en oranje `#eb6834` zijn de twee hoofdreeksen (getoetst op kleurenblindheid). Een vergelijkings- of theorielijn is donkergrijs `#52514e`. De voortgangsbalk gebruikt het blauw op een `bg-blue-100`-spoor.

---

## 4. Typografie

| Rol                    | Klassen                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| Paginatitel            | `text-2xl font-semibold tracking-tight`                                  |
| Ondertitel pagina      | `mt-1 text-sm text-slate-500`                                            |
| Sectietitel (in kaart) | `text-sm font-semibold text-slate-900`                                   |
| Kaarttitel             | `font-semibold text-slate-900`                                           |
| Body                   | `text-sm text-slate-600`                                                 |
| Label (formulier)      | `text-sm font-medium text-slate-700`                                     |
| Hint / meta            | `text-xs text-slate-500`                                                 |
| Kolomkop tabel         | `text-xs text-slate-500 font-medium`                                     |
| Kerncijfer groot       | `tabular text-2xl font-semibold tracking-tight`                          |
| Kerncijfer normaal     | `tabular text-xl font-semibold tracking-tight`                           |
| Kleine kapitalen-kop   | `text-xs font-medium tracking-wide text-slate-500 uppercase` (spaarzaam) |

Gewichten: `font-medium` (500) voor nadruk en knoppen, `font-semibold` (600) voor titels en getallen. Nooit `font-bold`.

---

## 5. Ruimte, vormen en layout

- **Paginabreedte:** `mx-auto max-w-6xl px-4 sm:px-6`, verticaal `py-6 sm:py-8`.
- **Ritme tussen blokken:** `space-y-6`. Grids: `gap-3` (kerncijfers), `gap-4` (kaarten) of `gap-6` (secties).
- **Binnenruimte:** kaart `p-4 sm:p-5`, kerncijfer `px-4 py-3.5`, sectiekop `px-4 py-3 sm:px-5`.
- **Afronding:** kaarten en modals `rounded-xl` (modal `rounded-2xl`), knoppen en invoer `rounded-lg`, badges `rounded` / `rounded-full`, kleine icoonknoppen `rounded-md`.
- **Hoogtes:** knop/invoer `h-10` (md) of `h-8` (sm). Klein filter `h-9`.
- **Breakpoints:** standaard Tailwind (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).
- **Grids:**
  - Kerncijfers: `grid grid-cols-2 gap-3 lg:grid-cols-4`. De eerste kaart krijgt op mobiel `col-span-2 lg:col-span-1`.
  - Kaarten: `grid gap-4 md:grid-cols-2 xl:grid-cols-3`.
- **Gelijke hoogte:** kaarten in een grid krijgen `h-full`, zodat een rij overal even hoog is.

---

## 6. Componenten

### Knop

```tsx
// Basis voor elke knop
'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

// Varianten
primary: 'bg-slate-900 text-white hover:bg-slate-700 focus-visible:outline-slate-900'
secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-500'
ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-500'
danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600'

// Maten
sm: 'h-8 gap-1.5 px-2.5 text-sm'
md: 'h-10 gap-2 px-4 text-sm'
```

- **Eén primaire knop per gebied:** dat is de hoofdactie, zoals "Betaling toevoegen".
- **Secundair** gebruik je voor gewone acties, **ghost** voor bijzaken als "Voorbeelddata wissen" of "Archiveren".
- **Icoon links:** een `size-4` icoon met de tekst ernaast.
- **Gevaarlijk-maar-zeldzaam**, zoals "Verwijderen" onderaan een pagina: ghost met `text-red-600 hover:bg-red-50 hover:text-red-700`.

**Icoonknop** (in tabelrijen), altijd met `aria-label` en `title`:

```tsx
'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40'
// Verwijderen: extra 'hover:text-red-600'
```

### Kaart en sectie

```tsx
// Kaart
<div className="rounded-xl bg-white ring-1 ring-slate-200">…</div>

// Sectie = kaart met kop (titel, uitleg, acties rechts) en inhoud
<Card>
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
    <div>
      <h2 className="text-sm font-semibold text-slate-900">Betalingen</h2>
      <p className="mt-0.5 text-sm text-slate-500">Uitleg in één zin.</p>
    </div>
    <div className="flex flex-wrap gap-2">{/* knoppen sm */}</div>
  </div>
  <div className="p-4 sm:p-5">…</div>
</Card>
```

Een klikbare kaart (bijvoorbeeld een kaart in het overzicht) krijgt `group relative transition-shadow hover:shadow-md hover:ring-slate-300`. De link in de titel krijgt `after:absolute after:inset-0`, zodat de hele kaart klikbaar is. Rechtsboven staat een chevron met `group-hover:translate-x-0.5`.

### Kerncijfer (stat card)

```tsx
<Card className="h-full px-4 py-3.5">
  <p className="text-sm text-slate-500">Totaal openstaand</p>
  <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-slate-900">€ 337.312,25</p>
  <div className="mt-1 text-xs text-slate-500">3,6% afgelost van € 350.000,00</div>
</Card>
```

Label boven, waarde groot, toelichting klein. Geen iconen, geen kleur.

### Voortgangsbalk

```tsx
<div
  role="progressbar"
  aria-valuenow={36}
  aria-valuemin={0}
  aria-valuemax={100}
  className="h-2 w-full overflow-hidden rounded-full bg-blue-100"
>
  <div className="h-full rounded-full bg-principal" style={{ width: '36%' }} />
</div>
```

### Invoervelden

```tsx
// Tekst / datum / bedrag
'block w-full rounded-lg border-0 bg-white px-3 py-2 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:outline-none aria-invalid:ring-red-400 sm:text-sm'
```

- **`text-base` op mobiel:** voorkomt dat iOS inzoomt bij focus. Vanaf `sm` wordt het `text-sm`.
- **Bedrag:** links in het veld een grijs `€` (`absolute left-3 text-sm text-slate-400`), het veld krijgt `pl-7 tabular` en `inputMode="decimal"`.
- **Percentage:** rechts in het veld een `%`, het veld krijgt `pr-8`.

**Keuzelijst:** gebruik `appearance-none` met een eigen pijltje. Anders tekent Safari zijn eigen knop zonder rand.

```tsx
<div className="relative">
  <select className="block h-10 w-full cursor-pointer appearance-none rounded-lg border-0 bg-white pr-9 pl-3 text-base text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-none sm:text-sm">…</select>
  <svg className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-500" …><path d="m6 9 6 6 6-6" /></svg>
</div>
```

**Veld met label, hint en fout** (alles gekoppeld via `id`, `aria-describedby` en `aria-invalid`):

```tsx
<div className="space-y-1.5">
  <label className="block text-sm font-medium text-slate-700">
    Einddatum <span className="ml-1 font-normal text-slate-400">(optioneel)</span>
  </label>
  <input … />
  <p className="text-xs text-slate-500">Hint in één zin.</p>      {/* óf: */}
  <p className="text-sm text-red-600">Wat er mis is en hoe het wel moet.</p>
</div>
```

**Foutblok bovenaan een formulier:**

```tsx
<div
  role="alert"
  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 ring-inset"
>
  …
</div>
```

### Keuzekaart (radio als kaart)

Voor 2 tot 3 duidelijke keuzes, zoals "Particulier / Zakelijk" of "Werkelijke dagen / 30/360":

```tsx
<label className={`flex cursor-pointer gap-3 rounded-lg p-3 ring-1 ring-inset ${
  checked ? 'bg-slate-50 ring-slate-900' : 'ring-slate-200 hover:bg-slate-50'}`}>
  <input type="radio" className="mt-0.5 accent-slate-900" … />
  <span>
    <span className="block text-sm font-medium text-slate-900">Titel</span>
    <span className="block text-xs text-slate-500">Uitleg</span>
  </span>
</label>
```

### Schakelaar (segmented control)

Voor filters en weergaven, zoals "3M · 6M · 1J · YTD · Alles" of "Actief / Gearchiveerd":

```tsx
<div role="group" className="inline-flex rounded-lg bg-slate-200/60 p-0.5">
  <button
    aria-pressed={active}
    className={`h-8 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    Actief (3)
  </button>
  …
</div>
```

### Badge / label

```tsx
<span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">voorbeeld</span>
<span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Hypotheekakte</span>
<span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Huidig</span>
<span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Lokale modus</span>
```

### Statusregel (icoon + tekst)

```tsx
<span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-emerald-700">
  <CheckIcon className="size-3.5" /> Klopt
</span>
// te weinig: text-red-700 + uitroepteken · te veel: text-amber-700 + pijl omhoog
```

### Lege staat

```tsx
<div className="flex flex-col items-center px-4 py-10 text-center">
  <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
    {/* icoon size-5 */}
  </div>
  <p className="font-medium text-slate-900">Nog geen betalingen</p>
  <p className="mt-1 max-w-sm text-sm text-slate-500">Wat dit is en wat je nu kunt doen.</p>
  <div className="mt-4">{/* primaire knop */}</div>
</div>
```

### Modal

Gebouwd op het native `<dialog>` met `showModal()`: focusvanger, Escape en een inerte achtergrond krijg je dan gratis. Op mobiel is het een sheet vanaf onderen, vanaf `sm` gecentreerd.

```tsx
<dialog className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-white p-0 shadow-xl sm:m-auto sm:max-w-lg sm:rounded-2xl">
  <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
    <div>
      <h2 className="text-base font-semibold">Titel</h2>
      <p className="mt-0.5 text-sm text-slate-500">Context</p>
    </div>
    {/* sluitknop size-8, text-slate-400 */}
  </header>
  <div className="overflow-y-auto px-5 py-4">{/* formulier, space-y-4 */}</div>
  <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">
    {/* Annuleren (secundair) · Opslaan (primair) */}
  </footer>
</dialog>
```

- **Klik op de achtergrond** sluit de modal.
- **Footer op mobiel:** de knoppen staan onder elkaar, met de primaire bovenaan (`flex-col-reverse`).
- **Bevestigen:** dezelfde modal, `sm:max-w-md`, met een korte zin, "Annuleren" en een rode bevestigknop. Gebruik dit altijd vóór verwijderen.

### Header met wisselaar

```tsx
<header className="border-b border-slate-200 bg-white">
  <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
    {/* logo: size-7 rounded-lg bg-slate-900 met wit icoon + naam (verborgen < md) */}
    {/* scheidingsstreep: h-5 w-px bg-slate-200 */}
    {/* wisselaar: h-9 rounded-lg px-2.5 text-sm font-medium ring-1 ring-inset ring-slate-200 + chevron */}
  </div>
</header>
```

**Uitklapmenu:** `absolute top-full mt-1.5 w-72 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200`. Items zijn `rounded-lg px-2.5 py-2 text-sm hover:bg-slate-100`. De actieve optie staat vet met een vinkje. Onder een scheidingslijn (`my-1.5 border-t border-slate-100`) staan de acties. Het menu sluit bij een klik buiten het menu en met Escape, en je navigeert met de pijltjestoetsen.

### Tabel

```tsx
<div className="-mx-4 overflow-x-auto sm:-mx-5">
  {' '}
  {/* tot de rand van de kaart */}
  <table className="tabular w-full min-w-200 text-sm">
    <thead className="border-b border-slate-200 text-xs text-slate-500">…</thead>{' '}
    {/* th: px-2 py-2 font-medium */}
    <tbody className="divide-y divide-slate-100">…</tbody>{' '}
    {/* td: px-2 py-2.5, rij hover:bg-slate-50 */}
    <tfoot className="border-t border-slate-200 font-medium">…</tfoot>
  </table>
</div>
```

- **Bedragen** staan rechts uitgelijnd met `whitespace-nowrap`. Leeg is een lichtgrijze "—".
- **Sorteerbare kolomkop:** een knop met een klein pijltje, en `aria-sort` op de `th`.
- **Uitklaprij:** `bg-slate-50/70 text-xs text-slate-600` met "↳" ervoor.

### Tijdlijn

Een verticale lijn (`w-px bg-slate-200`) met punten van `size-2.5` en een `ring-4 ring-white`. Het huidige punt is gekleurd (`bg-principal`), een toekomstig punt is hol (`border-2 border-slate-300 bg-white`) en een verleden punt is `bg-slate-300`.

### Uploadzone

```tsx
'flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 px-4 py-10 text-center hover:border-slate-300 hover:bg-slate-50'
// tijdens slepen: border-slate-900 bg-slate-50, plus overlay "Laat los om te uploaden"
```

---

## 7. Iconen

Lijniconen in de stijl van Lucide/Heroicons outline: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.75}`, met ronde uiteinden en hoeken, standaard `size-4`, en `aria-hidden="true"`. In lege staten zijn ze `size-5`. Ze nemen altijd de tekstkleur over. (Je kunt ook gewoon het pakket `lucide-react` gebruiken met `strokeWidth={1.75}`.)

---

## 8. Grafieken

- **Recharts**, altijd in een `ResponsiveContainer` met een vaste hoogte (`h-64 sm:h-72`).
- **Assen:** zonder lijnen en streepjes, met tekst `#64748b` op 12px. Grid alleen horizontaal, `#e2e8f0`, ononderbroken.
- **Lijnen** 2px dik. Een vlak eronder heeft 10% dekking. Een saldo dat in stappen daalt tekent je trapsgewijs (`stepAfter`).
- **Staven** maximaal 24px breed, alleen bovenaan afgerond (`radius={[4, 4, 0, 0]}`), met een witte scheiding van 1px tussen gestapelde delen.
- **Legenda** in HTML boven de grafiek: een gekleurd blokje of streepje met grijze tekst. De tekst zelf krijgt nooit de reekskleur.
- **Tooltip:** `rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200`, met de titel `font-medium` en waarden met `tabular`.
- **Nooit twee y-assen.** Twee soorten getallen horen in twee grafieken.

---

## 9. Tekst en notatie

- **Taal:** Nederlands, je-vorm, kort en concreet. Knoppen zijn een werkwoord of resultaat: "Betaling toevoegen", "Opslaan", "Archiveren".
- **Bedragen:** `Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })` geeft "€ 1.234,56". Compact op grafiekassen geeft "€ 250K".
- **Percentages:** "3,85%", met minimaal 2 en maximaal 3 decimalen.
- **Datums:** "dd-mm-jjjj". Maanden kort: "mrt '26", voluit: "maart 2026".
- **Invoer:** accepteer "250.000,00", "250000" én "1234.56".
- **Meldingen:** zeg wat er mis is en wat de oplossing is, bijvoorbeeld "Er kan maximaal € 1.000,00 worden afgelost", niet "Ongeldige invoer".

---

## 10. Toegankelijkheid

- **Focus:** zichtbaar via `focus-visible:outline-2 outline-offset-2` op knoppen en `focus:ring-2 ring-slate-900` op velden.
- **Labels:** iconen zonder tekst hebben een `aria-label`, velden hebben een gekoppeld `<label>`, meldingen hebben `role="alert"`.
- **Status:** nooit alleen met kleur, altijd ook een icoon of woord ("Klopt", "te weinig").
- **Schakelaars en keuzes:** gebruik `aria-pressed`, `aria-expanded` en `aria-sort` waar het hoort.
- **Mobiel:** tikdoelen zijn minimaal 32px (`size-8`), en invoervelden op mobiel `text-base` tegen het inzoomen.

---

## 11. Checklist voor een nieuw scherm

- [ ] Paginatitel `text-2xl font-semibold tracking-tight`, met de ondertitel in `text-slate-500`
- [ ] Filters links en acties rechts op één regel (`flex flex-wrap items-center justify-between gap-3`)
- [ ] Maximaal één primaire knop per gebied
- [ ] Inhoud in kaarten of secties (`rounded-xl bg-white ring-1 ring-slate-200`)
- [ ] Getallen met `.tabular` en Nederlandse notatie
- [ ] Een lege staat met uitleg en actie
- [ ] Een bevestiging vóór verwijderen
- [ ] Getest op 390px: geen horizontale scroll, en modals als sheet
