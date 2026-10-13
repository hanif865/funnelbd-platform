import Anthropic from '@anthropic-ai/sdk';

/**
 * AI copy generation for the landing-page builder. Uses the Anthropic API
 * (Claude) to turn a product name + a few notes into a full set of funnel
 * content fields, written in the customer's language (Bangla by default).
 *
 * Gated on ANTHROPIC_API_KEY: when unset, the feature is cleanly unavailable
 * rather than erroring deep in a request. The operator sets the key in .env.
 */
export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let _client = null;
function client() {
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}

export class AINotConfiguredError extends Error {
  constructor() {
    super('AI is not configured. Set ANTHROPIC_API_KEY on the server to enable it.');
    this.name = 'AINotConfiguredError';
  }
}

// The content keys we let the model fill (a subset of Product.content), plus the
// headline (name) and benefits HTML (description) and a few offer ideas.
const CONTENT_KEYS = [
  'brandTagline', 'subheadline', 'heroSubtext', 'heroHighlight',
  'benefitTitle', 'usageTitle', 'usageHtml', 'infoBar',
  'offersTitle', 'buttonText', 'checkoutTitle', 'checkoutSubtitle',
  'reviewsTitle', 'trendingBadge',
];

function systemPrompt(language) {
  const lang = language === 'en' ? 'English' : 'Bangla (বাংলা)';
  return [
    `You write high-converting single-product cash-on-delivery (COD) sales funnel copy for Bangladeshi e-commerce.`,
    `Write ALL customer-facing text in ${lang}. Keep it punchy, benefit-led, trustworthy and mobile-friendly. No fake medical claims.`,
    `Return ONLY a single JSON object (no markdown, no commentary) with exactly these top-level keys:`,
    `- "name": string — the main product headline.`,
    `- "description": string — benefits as an HTML <ul><li>…</li></ul> list (5–7 concrete benefits).`,
    `- "content": object with these string keys: ${CONTENT_KEYS.join(', ')}. "usageHtml" is an HTML <ul> list; the rest are short plain strings (badges may use an emoji).`,
    `- "offers": array of 2–3 objects { "title": string, "price": number, "quantity": number } — realistic COD package tiers (e.g. 1pc / 2pc combo). Prices in BDT as plausible placeholders the seller will edit.`,
    `Do not include any key other than name, description, content, offers.`,
  ].join('\n');
}

function extractJson(text) {
  if (!text) throw new Error('Empty AI response.');
  // Strip accidental code fences, then take the outermost { … }.
  const cleaned = String(text).replace(/```json\s*|\s*```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI response was not JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * @param {{productName:string, notes?:string, language?:'bn'|'en'}} input
 * @returns {Promise<{name:string, description:string, content:object, offers:any[]}>}
 */
export async function generateLandingContent({ productName, notes = '', language = 'bn' } = {}) {
  if (!aiConfigured()) throw new AINotConfiguredError();
  const name = String(productName || '').trim();
  if (!name) throw new Error('Enter a product name.');

  const userMsg =
    `Product: ${name}\n` +
    (notes ? `Seller notes / details: ${String(notes).slice(0, 2000)}\n` : '') +
    `Generate the funnel copy JSON now.`;

  const resp = await client().messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    system: systemPrompt(language),
    messages: [{ role: 'user', content: userMsg }],
  });

  const textBlock = (resp.content || []).find((b) => b.type === 'text');
  const data = extractJson(textBlock?.text);

  // Sanitize to exactly what the funnel accepts.
  const content = {};
  for (const k of CONTENT_KEYS) {
    if (typeof data?.content?.[k] === 'string') content[k] = data.content[k];
  }
  const offers = Array.isArray(data?.offers)
    ? data.offers.slice(0, 4).map((o) => ({
        title: String(o?.title || '').slice(0, 120),
        price: Math.max(0, Math.round(Number(o?.price) || 0)),
        quantity: Math.max(1, Math.round(Number(o?.quantity) || 1)),
      })).filter((o) => o.title)
    : [];

  return {
    name: String(data?.name || name).slice(0, 200),
    description: typeof data?.description === 'string' ? data.description : '',
    content,
    offers,
  };
}

export default { aiConfigured, generateLandingContent, AINotConfiguredError };
