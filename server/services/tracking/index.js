import { config } from '../../config/index.js';
import { EventLog } from '../../models/index.js';
import { getTrackingConfig } from './config.js';
import { sendFacebookEvent } from './facebook.capi.js';
import { sendGoogleEvent } from './google.mp.js';
import { sendTikTokEvent } from './tiktok.events.js';
import { reportError } from '../systemErrors.js';
import {
  buildFacebookUserData,
  buildTikTokUserData,
  buildGoogleUserData,
  extractCity,
} from './hash.util.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;
const CURRENCY = 'BDT';

/**
 * The event map: our "moments" → each platform's event name(s).
 *
 * GA4 is intentionally server-side for PURCHASE only. gtag on the browser
 * already covers page_view/view_item/begin_checkout; sending those again via
 * Measurement Protocol would double-count in GA4. Purchases dedupe safely by
 * transaction_id, so the server purchase is both reliable and non-duplicating.
 */
const EVENT_MAP = {
  pageview: { facebook: ['PageView', 'ViewContent'], tiktok: ['ViewContent'], google: [] },
  add_to_cart: { facebook: ['AddToCart'], tiktok: ['AddToCart'], google: [] },
  initiate: { facebook: ['InitiateCheckout'], tiktok: ['InitiateCheckout'], google: [] },
  purchase: { facebook: ['Purchase'], tiktok: ['CompletePayment'], google: ['purchase'] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Per-platform send dispatch (fetches fresh config so tokens never sit in a
//    queue payload). Returns the platform service's structured result. ──
async function callPlatform(platform, eventName, eventInput, productId) {
  const cfg = await getTrackingConfig(productId);

  if (platform === 'facebook') {
    if (!cfg.facebook.enabled || !cfg.facebook.pixelId || !cfg.facebook.accessToken) {
      return { ok: false, skipped: true, error: 'facebook disabled or unconfigured' };
    }
    return sendFacebookEvent(cfg.facebook, { ...eventInput, eventName });
  }
  if (platform === 'tiktok') {
    if (!cfg.tiktok.enabled || !cfg.tiktok.pixelId || !cfg.tiktok.accessToken) {
      return { ok: false, skipped: true, error: 'tiktok disabled or unconfigured' };
    }
    return sendTikTokEvent(cfg.tiktok, { ...eventInput, eventName });
  }
  if (platform === 'google') {
    if (!cfg.google.enabled || !cfg.google.measurementId || !cfg.google.apiSecret) {
      return { ok: false, skipped: true, error: 'google disabled or unconfigured' };
    }
    return sendGoogleEvent({ ...cfg.google, debug: false }, eventInput);
  }
  return { ok: false, skipped: true, error: 'unknown platform' };
}

/**
 * Runs one tracking job: send + log to event_logs, with up to 3 attempts.
 * Called both inline (no Redis) and by the BullMQ worker. Never throws.
 *
 * @param {object} job { platform, eventName, eventId, orderId, eventInput }
 */
export async function runTrackingJob(job) {
  const { platform, eventName, eventId, orderId, eventInput, productId } = job;

  let result;
  let attempts = 0;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    attempts = i;
    result = await callPlatform(platform, eventName, eventInput, productId);
    if (result.ok || result.skipped) break;
    if (i < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * i);
  }

  // Disabled/unconfigured platforms are skipped silently (no log noise).
  if (result.skipped) return result;

  await EventLog.create({
    platform,
    eventName,
    eventId,
    orderId: orderId || null,
    productId: productId || null,
    payload: result.payload || eventInput,
    status: result.ok ? 'success' : 'failed',
    response: result.response ?? null,
    error: result.error || '',
    attempts,
  }).catch((e) => reportError('tracking:event-log', e));

  return result;
}

// ── Job builders (build the hashed, platform-specific payloads) ──

function eventSourceUrl(path = '/') {
  return `${config.baseUrl}${path}`;
}

/** Build the jobs for a completed purchase (richest identifiers → best EMQ).
 * `sourceUrl` is the real page the buyer was on (e.g. the main domain) — pass it
 * so Meta/TikTok attribute the event to the actual landing domain, not the
 * app's own baseUrl. Falls back to baseUrl when not provided. */
export function buildPurchaseJobs(order, sourceUrl) {
  const t = order.tracking || {};
  const city = extractCity(order.customer?.address, order.deliveryZoneName);
  const identifiers = {
    phone: order.customer?.phone,
    name: order.customer?.name,
    address: order.customer?.address,
    zoneName: order.deliveryZoneName,
    city,
    country: 'bd',
    externalId: t.externalId || '',
    fbp: t.fbp,
    fbc: t.fbc || (t.fbclid ? `fb.1.${Date.now()}.${t.fbclid}` : ''),
    fbclid: t.fbclid,
    ttclid: t.ttclid,
    ttp: t.ttp,
    ip: t.ip,
    userAgent: t.userAgent,
    gaClientId: t.gaClientId || '',
  };
  const eventId = t.eventId;
  const value = order.total;
  const contentId = String(order.offerId);

  const jobs = [];
  const url = sourceUrl || eventSourceUrl('/');

  for (const eventName of EVENT_MAP.purchase.facebook) {
    jobs.push({
      platform: 'facebook',
      eventName,
      eventId,
      orderId: order._id,
      eventInput: {
        eventId,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: url,
        actionSource: 'website',
        userData: buildFacebookUserData(identifiers),
        customData: {
          currency: CURRENCY,
          value,
          content_type: 'product',
          content_ids: [contentId],
          contents: [{ id: contentId, quantity: order.quantity, item_price: order.unitPrice }],
          num_items: order.quantity,
          order_id: String(order.orderNumber),
        },
      },
    });
  }

  for (const eventName of EVENT_MAP.purchase.tiktok) {
    jobs.push({
      platform: 'tiktok',
      eventName,
      eventId,
      orderId: order._id,
      eventInput: {
        eventId,
        eventTime: Math.floor(Date.now() / 1000),
        pageUrl: url,
        user: buildTikTokUserData(identifiers),
        properties: {
          currency: CURRENCY,
          value,
          contents: [{ content_id: contentId, content_name: order.offerTitle, quantity: order.quantity, price: order.unitPrice }],
          content_type: 'product',
        },
      },
    });
  }

  for (const _ of EVENT_MAP.purchase.google) {
    jobs.push({
      platform: 'google',
      eventName: 'purchase',
      eventId,
      orderId: order._id,
      eventInput: {
        clientId: t.gaClientId || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
        userData: buildGoogleUserData(identifiers),
        events: [
          {
            name: 'purchase',
            params: {
              currency: CURRENCY,
              value,
              transaction_id: String(order.orderNumber), // GA4 dedupe key
              items: [
                {
                  item_id: contentId,
                  item_name: order.offerTitle,
                  price: order.unitPrice,
                  quantity: order.quantity,
                },
              ],
            },
          },
        ],
      },
    });
  }

  // Each job carries its funnel so the worker sends with that funnel's pixels.
  jobs.forEach((j) => { j.productId = order.productId || null; });
  return jobs;
}

/**
 * Build jobs for a browser-originated moment (pageview/add_to_cart/initiate). FB + TikTok
 * only (GA4 handled by gtag on the browser). Identifiers are whatever the
 * browser + request could supply — usually weaker than at purchase.
 */
export function buildMomentJobs({ moment, eventId, identifiers = {}, custom = {}, orderId = null, productId = null }) {
  const map = EVENT_MAP[moment];
  if (!map) return [];
  // The browser sends the real page URL (custom.sourceUrl); fall back to baseUrl.
  const url = custom.sourceUrl || eventSourceUrl(custom.path || '/');
  const jobs = [];

  for (const eventName of map.facebook) {
    const eId = (moment === 'pageview' && eventName === 'ViewContent' && custom.vcEventId)
      ? custom.vcEventId
      : eventId;

    jobs.push({
      platform: 'facebook',
      eventName,
      eventId: eId,
      orderId,
      eventInput: {
        eventId: eId,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: url,
        actionSource: 'website',
        userData: buildFacebookUserData(identifiers),
        customData: buildMomentCustomData(custom),
      },
    });
  }

  for (const eventName of map.tiktok) {
    const eId = (moment === 'pageview' && eventName === 'ViewContent' && custom.vcEventId)
      ? custom.vcEventId
      : eventId;

    jobs.push({
      platform: 'tiktok',
      eventName,
      eventId: eId,
      orderId,
      eventInput: {
        eventId: eId,
        eventTime: Math.floor(Date.now() / 1000),
        pageUrl: url,
        user: buildTikTokUserData(identifiers),
        properties: buildMomentCustomData(custom),
      },
    });
  }

  jobs.forEach((j) => { j.productId = productId || null; });
  return jobs;
}

function buildMomentCustomData(custom = {}) {
  const data = { currency: CURRENCY };
  if (custom.value != null) data.value = custom.value;
  if (custom.contentIds?.length) {
    data.content_type = 'product';
    data.content_ids = custom.contentIds;
    data.contents = custom.contentIds.map((id) => ({
      id,
      quantity: custom.numItems || 1,
      item_price: custom.value ? (custom.value / (custom.numItems || 1)) : undefined,
    }));
  }
  if (custom.numItems != null) data.num_items = custom.numItems;
  return data;
}

export { EVENT_MAP };
export default { runTrackingJob, buildPurchaseJobs, buildMomentJobs, EVENT_MAP };
