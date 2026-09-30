/**
 * Facebook Conversions API (server-side). Sends an event to the Graph API.
 * Never throws on HTTP failure — returns a structured result the dispatcher
 * logs to event_logs (so the admin Tracking page can debug delivery).
 */
const DEFAULT_API_VERSION = 'v21.0';

/**
 * @param {object} config  { pixelId, accessToken, testEventCode?, apiVersion? }
 * @param {object} event   { eventName, eventId, eventTime, userData, customData, eventSourceUrl, actionSource? }
 * @returns {Promise<{ok:boolean, status:number, response:any, error:string, payload:object}>}
 */
export async function sendFacebookEvent(config, event) {
  const apiVersion = config.apiVersion || DEFAULT_API_VERSION;
  const url = `https://graph.facebook.com/${apiVersion}/${config.pixelId}/events`;

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime || Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: event.actionSource || 'website',
        ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
        user_data: event.userData || {},
        ...(event.customData ? { custom_data: event.customData } : {}),
      },
    ],
    access_token: config.accessToken,
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const response = await res.json().catch(() => ({}));
    // FB returns 200 with { events_received: 1 } on success, or { error: {...} }.
    const ok = res.ok && !response.error;
    return {
      ok,
      status: res.status,
      response,
      error: ok ? '' : response.error?.message || `HTTP ${res.status}`,
      // Strip the token from the logged payload.
      payload: { ...payload, access_token: '***' },
    };
  } catch (err) {
    return { ok: false, status: 0, response: null, error: err.message, payload: { ...payload, access_token: '***' } };
  }
}

export default sendFacebookEvent;
