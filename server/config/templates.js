/**
 * Prebuilt landing-page templates (visual themes). Each funnel's product picks
 * one; the landing page renders `fk-theme-<key>` on <body> and public/css/
 * landing.css overrides the design tokens for that key. "classic" is the
 * original red/green look (no overrides). Keep this key list in sync with the
 * CSS theme blocks and the admin picker (admin-panel constants LANDING_TEMPLATES).
 */
export const TEMPLATE_KEYS = [
  'classic', 'emerald', 'royal', 'sunset', 'ocean',
  'rose', 'gold', 'teal', 'berry', 'midnight',
];

export const DEFAULT_TEMPLATE = 'classic';

export function isTemplate(key) {
  return TEMPLATE_KEYS.includes(key);
}

/**
 * Layouts are distinct landing-page DESIGNS (different structure), independent
 * of the colour template. Each maps to an EJS view: 'classic' → views/landing.ejs,
 * others → views/landing-<key>.ejs. All reuse the shared checkout + gallery
 * partials so the order form and tracking keep working in every design.
 */
export const LAYOUT_KEYS = ['classic', 'spotlight'];
export const DEFAULT_LAYOUT = 'classic';

export function isLayout(key) {
  return LAYOUT_KEYS.includes(key);
}

/** The EJS view name for a layout key. */
export function layoutView(key) {
  return isLayout(key) && key !== 'classic' ? `landing-${key}` : 'landing';
}

export default { TEMPLATE_KEYS, DEFAULT_TEMPLATE, isTemplate, LAYOUT_KEYS, DEFAULT_LAYOUT, isLayout, layoutView };
