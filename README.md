# Color Palette

Minimalist color palette extraction tool. Drop an image, get the dominant color,
a harmony ribbon, and a copyable swatch palette (HEX / RGB / HSL).

## Features

- Drag & drop or paste an image URL
- Dominant color card with HEX / RGB / HSL / luminance
- Harmony ribbon generated from the extracted palette
- Swatch grid with one-click copy
- Adjustable palette size (1–30 colors, capped by the image's unique color count)
- Built-in eyedropper inspector with zoom and full-screen focus mode
- Fully client-side, no backend

## Run locally

Just open `index.html` in a browser — no build step, no dependencies to install.

Or serve it:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup / structure |
| `style.css` | Custom styles (scrollbars, glassmorphism, slider, non-scrollable shell) |
| `app.js` | App logic (extraction, eyedropper, swatches, copy) |

## Tech

Vanilla HTML/CSS/JS, Tailwind via CDN, Font Awesome, ColorThief, Inter + JetBrains Mono.

