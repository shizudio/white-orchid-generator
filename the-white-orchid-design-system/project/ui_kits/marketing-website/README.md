# Marketing website — UI kit

A high-fidelity, clickable recreation of The White Orchid marketing site. Six routes wired together with React state — no router, no backend.

## Run

Open `index.html`. The header navigates between pages; "Book a visit" deep-links to the form.

## Files

- `index.html` — entry, mounts `<App>` with route state.
- `site.css` — site-wide styles, imports `colors_and_type.css`.
- `Components.jsx` — Header, Footer, Photo placeholder, ProgrammeCard, Stat, QuoteBlock.
- `Pages.jsx` — `PAGES.home`, `.about`, `.programmes`, `.day`, `.stories`, `.visit` (form with success state).

## Pages

| Route | What it covers |
|------|----------------|
| `home` | Hero, belief section, programme grid (deep), stats, quote, CTA (deep) |
| `about` | Editorial long-form, photo grid, three-beliefs (deep) |
| `programmes` | Four programme cards with days/ratio/fee |
| `day` | Hour-by-hour schedule list |
| `stories` | Field-notes index |
| `visit` | Booking form → thank-you screen |

## What's intentionally omitted

- No router / URLs — single-document state.
- No real photography — `<Photo>` renders a sage placeholder with the Pattern2 motif and a label. Replace with commissioned imagery.
- No CMS-style story detail page (only the index is mocked).
- No accessibility audit — semantic HTML used, but no focus-trap on form, no skip-link.

## Conventions used

- `<Photo ratio label />` — drop-in placeholder where a real image would go.
- Deep sections (`<section className="section deep">`) auto-invert text and apply the petal pattern.
- All buttons use `.btn` + `.btn-pri | .btn-out | .btn-ghost`. On a deep section the primary button automatically inverts.
- Tags use `.tag` (and `.tag-on-green` when nested in a deep section).
