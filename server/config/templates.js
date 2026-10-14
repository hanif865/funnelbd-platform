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

export default { TEMPLATE_KEYS, DEFAULT_TEMPLATE, isTemplate };
