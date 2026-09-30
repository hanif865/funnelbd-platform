/**
 * Google Analytics 4 Measurement Protocol (server-side). Sends events to GA4
 * with the client_id read from the browser's _ga cookie so server + browser
 * hits stitch to the same user. For purchases, `transaction_id` (the order
 * number) lets GA4 dedupe against the gtag browser purchase.
 *
 * Returns a structured result; never throws.
 */
const ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

/**
 * @param {object} config  { measurementId, apiSecret, debug? }
 * @param {object} event   { clientId, events:[{name, params}], userData?, userId? }
 */
export async function sendGoogleEvent(config, event) {
  const base = config.debug ? DEBUG_ENDPOINT : ENDPOINT;
  const url = `${base}?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`;

  const payload = {
    client_id: event.clientId || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
    ...(event.userId ? { user_id: event.userId } : {}),
    ...(event.userData ? { user_data: event.userData } : {}),
    events: event.events || [],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // MP returns 204 No Content on success (empty body). Debug endpoint returns
    // 200 with validationMessages.
    let response = null;
    if (config.debug) response = await res.json().catch(() => ({}));
    const validationIssues = response?.validationMessages?.length ? response.validationMessages : null;
    const ok = res.status === 204 || (res.ok && !validationIssues);
    return {
      ok,
      status: res.status,
      response: response || { note: 'MP returns 204 with no body on success' },
      error: ok ? '' : validationIssues ? JSON.stringify(validationIssues) : `HTTP ${res.status}`,
      payload: { ...payload, _endpoint: base },
    };
  } catch (err) {
    return { ok: false, status: 0, response: null, error: err.message, payload };
  }
}

export default sendGoogleEvent;
