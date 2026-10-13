import { config } from '../config/index.js';

/**
 * Cloudflare for SaaS "custom hostnames" — provisions a TLS certificate for a
 * tenant's own domain pointed at our platform. Entirely optional: when the CF
 * API token + zone id aren't configured, every call is a no-op that returns
 * { skipped: true }, so custom domains still function (the operator can terminate
 * TLS another way) and nothing breaks in dev or tests.
 *
 * Docs: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
 */
export function cfConfigured() {
  return !!(config.cloudflare.apiToken && config.cloudflare.zoneId);
}

async function cfApi(path, opts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${config.cloudflare.apiToken}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  return res.json().catch(() => ({ success: false, errors: [{ message: 'invalid response' }] }));
}

/** Create a custom hostname (issues a DV cert via TXT). Returns { id, status } or { error }. */
export async function createCustomHostname(hostname) {
  if (!cfConfigured()) return { skipped: true };
  const data = await cfApi(`/zones/${config.cloudflare.zoneId}/custom_hostnames`, {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
    }),
  });
  if (!data.success) return { error: data.errors?.[0]?.message || 'Cloudflare error' };
  return { id: data.result.id, status: data.result.status, ssl: data.result.ssl };
}

/** Current status of a custom hostname (SSL provisioning progress). */
export async function getCustomHostnameStatus(id) {
  if (!cfConfigured()) return { skipped: true };
  const data = await cfApi(`/zones/${config.cloudflare.zoneId}/custom_hostnames/${id}`);
  if (!data.success) return { error: data.errors?.[0]?.message || 'Cloudflare error' };
  return { id: data.result.id, status: data.result.status, ssl: data.result.ssl };
}

/** Remove a custom hostname (on domain delete). */
export async function deleteCustomHostname(id) {
  if (!cfConfigured()) return { skipped: true };
  return cfApi(`/zones/${config.cloudflare.zoneId}/custom_hostnames/${id}`, { method: 'DELETE' });
}

export default { cfConfigured, createCustomHostname, getCustomHostnameStatus, deleteCustomHostname };
