export const BRAND = {
  short: 'GU Tech',
  name: 'Ghazali University',
  school: 'School of Technology',
};

// Official logo: drop it at src/assets/brand/logo.png (or .svg/.jpg/.webp). Resolved at build time, so a missing file
// never causes a 404; the UI falls back to a text mark until the logo is added.
const found = import.meta.glob('../assets/brand/logo.{png,svg,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const LOGO_URL: string | null = Object.values(found)[0] ?? null;
