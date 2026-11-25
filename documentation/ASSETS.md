# Assets
- **Logo:** put the official GU Tech logo (square PNG/SVG, ideally 512x512) at `frontend/src/assets/brand/logo.png` (or `.svg`/`.jpg`/`.webp`) and rebuild. It is bundled at build time and used on the login page, sidebar, top bar and favicon. Until then a text "GU" mark is shown, with no failing network requests.
- Reference screenshots/video: keep them in `assets/` (not served).
- Brand colour: maroon `#7a1f2b` (CSS variable `--maroon` in `frontend/src/styles.css`); adjust to the exact brand value once confirmed from the logo.
