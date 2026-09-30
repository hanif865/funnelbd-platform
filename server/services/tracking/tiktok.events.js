/**
 * TikTok Events API (server-side). Sends an event to TikTok Business API.
 * Uses the same event_id as the browser pixel so TikTok deduplicates.
 * Returns a structured result; never throws.
 */
const ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

/**
 * @param {object} config  { pixelId, accessToken, testEventCode? }
 * @param {object} event   { eventName, eventId, eventTime, user, properties, pageUrl }
 */
export async function sendTikTokEvent(config, event) {
  const payload = {
    event_source: 'web',
    event_source_id: config.pixelId,
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
    data: [
      {
        event: event.eventName,
        event_time: event.eventTime || Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        user: event.user || {},
        properties: event.properties || {},
        page: event.pageUrl ? { url: event.pageUrl } : undefined,
      },
    ],
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Access-Token': config.accessToken },
      body: JSON.stringify(payload),
    });
    const response = await res.json().catch(() => ({}));
    // TikTok returns { code: 0, message: 'OK' } on success.
    const ok = res.ok && response.code === 0;
    return {
      ok,
      status: res.status,
      response,
      error: ok ? '' : response.message || `HTTP ${res.status}`,
      payload,
    };
  } catch (err) {
    return { ok: false, status: 0, response: null, error: err.message, payload };
  }
}

export default sendTikTokEvent;
