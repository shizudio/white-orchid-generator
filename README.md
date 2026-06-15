# The White Orchid — Social Media Generator

Internal tool for generating brand-consistent social media assets for The White Orchid.

## Features

- **5 post templates**: Photo + Logo, Quote, Event/Date, Text Post, Photo + Text
- **Brand-accurate**: Burnham, White Smoke, Wisteria, Celadon, Jet palette with Syne, Fira Sans, Cormorant Garamond typography
- **Logo management**: Upload icon + wordmark, persisted across sessions
- **Direct manipulation**: Drag to position logo, scroll to resize on the preview canvas
- **Image library**: Uploaded images auto-save for reuse
- **Asset history**: Thumbnails of every export saved for grid planning
- **1080×1080 PNG export**

## Setup

```bash
npm install
npm run dev
```

## Deploy to Vercel

Connect the repo in Vercel dashboard. Framework preset: Vite. No additional config needed.

## Typography note

The brand specifies **Romie** for titles and quotes. Romie is a commercial typeface, so this tool uses **Cormorant Garamond** as a free substitute. To use Romie:

1. Add the font files to `public/fonts/`
2. Add a `@font-face` rule in `index.html`
3. Update the `F.title` and `F.quote` values in `src/App.jsx`

## Built for

The White Orchid — Premium Early Childhood Education
