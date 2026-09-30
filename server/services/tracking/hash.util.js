import crypto from 'node:crypto';
import { toE164 } from '../../utils/phone.js';

/**
 * Customer-identifier normalization + SHA-256 hashing for server-side tracking.
 *
 * The stronger the identifiers we send, the higher the Event Match Quality
 * (target 9+/10) — which is what lets FB/TikTok find cheaper buyers. BD
 * customers rarely give email but always give a phone, so the phone is the
 * single most important match key (hashed in 8801XXXXXXXXX form).
 *
 * FB/TikTok rules: PII fields are lowercased, trimmed, then SHA-256 hex hashed.
 * fbp/fbc/ip/user-agent are sent RAW (never hashed).
 */

export function sha256Hex(value) {
  if (value === undefined || value === null || value === '') return '';
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Lowercase + trim + collapse internal whitespace (for names/cities). */
function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Split a full name into first / last tokens. */
export function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const BD_CITIES = [
  { match: /(ঢাকা|dhaka)/i, name: 'dhaka' },
  { match: /(চট্টগ্রাম|চাটগাঁ|chattogram|chittagong)/i, name: 'chattogram' },
  { match: /(সিলেট|sylhet)/i, name: 'sylhet' },
  { match: /(রাজশাহী|rajshahi)/i, name: 'rajshahi' },
  { match: /(খুলনা|khulna)/i, name: 'khulna' },
  { match: /(বরিশাল|barisal|barishal)/i, name: 'barisal' },
  { match: /(রংপুর|rangpur)/i, name: 'rangpur' },
  { match: /(ময়মনসিংহ|mymensingh)/i, name: 'mymensingh' },
  { match: /(গাজীপুর|gazipur)/i, name: 'gazipur' },
  { match: /(নারায়ণগঞ্জ|narayanganj)/i, name: 'narayanganj' },
  { match: /(কুমিল্লা|cumilla|comilla)/i, name: 'cumilla' },
  { match: /(বগুড়া|bogra|bogura)/i, name: 'bogra' },
  { match: /(কক্সবাজার|coxsbazar|cox's bazar)/i, name: 'coxsbazar' },
  { match: /(যশোর|jashore|jessore)/i, name: 'jashore' },
  { match: /(ফেনী|feni)/i, name: 'feni' },
  { match: /(ব্রাহ্মণবাড়িয়া|brahmanbaria)/i, name: 'brahmanbaria' },
  { match: /(টাঙ্গাইল|tangail)/i, name: 'tangail' },
  { match: /(নরসিংদী|narsingdi)/i, name: 'narsingdi' },
  { match: /(সিরাজগঞ্জ|sirajganj)/i, name: 'sirajganj' },
  { match: /(পাবনা|pabna)/i, name: 'pabna' },
  { match: /(দিনাজপুর|dinajpur)/i, name: 'dinajpur' },
  { match: /(কুষ্টিয়া|kushtia)/i, name: 'kushtia' },
  { match: /(ফরিদপুর|faridpur)/i, name: 'faridpur' },
  { match: /(জামালপুর|jamalpur)/i, name: 'jamalpur' },
  { match: /(নোয়াখালী|noakhali)/i, name: 'noakhali' },
  { match: /(চাঁদপুর|chandpur)/i, name: 'chandpur' },
  { match: /(কিশোরগঞ্জ|kishoreganj)/i, name: 'kishoreganj' },
  { match: /(মানিকগঞ্জ|manikganj)/i, name: 'manikganj' },
  { match: /(মুন্সীগঞ্জ|munshiganj)/i, name: 'munshiganj' },
  { match: /(গোপালগঞ্জ|gopalganj)/i, name: 'gopalganj' },
  { match: /(মাদারীপুর|madaripur)/i, name: 'madaripur' },
  { match: /(শরীয়তপুর|shariatpur)/i, name: 'shariatpur' },
  { match: /(রাজবাড়ী|rajbari)/i, name: 'rajbari' },
  { match: /(নেত্রকোণা|netrokona)/i, name: 'netrokona' },
  { match: /(শেরপুর|sherpur)/i, name: 'sherpur' },
  { match: /(হবিগঞ্জ|habiganj)/i, name: 'habiganj' },
  { match: /(মৌলভীবাজার|moulvibazar)/i, name: 'moulvibazar' },
  { match: /(সুনামগঞ্জ|sunamganj)/i, name: 'sunamganj' },
  { match: /(নাটোর|natore)/i, name: 'natore' },
  { match: /(নওগাঁ|naogaon)/i, name: 'naogaon' },
  { match: /(চাঁপাইনবাবগঞ্জ|chapai)/i, name: 'chapainawabganj' },
  { match: /(জয়পুরহাট|joypurhat)/i, name: 'joypurhat' },
  { match: /(বাগেরহাট|bagerhat)/i, name: 'bagerhat' },
  { match: /(চুয়াডাঙ্গা|chuadanga)/i, name: 'chuadanga' },
  { match: /(ঝিনাইদহ|jhenaidah)/i, name: 'jhenaidah' },
  { match: /(মাগুরা|magura)/i, name: 'magura' },
  { match: /(মেহেরপুর|meherpur)/i, name: 'meherpur' },
  { match: /(নড়াইল|narail)/i, name: 'narail' },
  { match: /(সাতক্ষীরা|satkhira)/i, name: 'satkhira' },
  { match: /(পটুয়াখালী|patuakhali)/i, name: 'patuakhali' },
  { match: /(পিরোজপুর|pirojpur)/i, name: 'pirojpur' },
  { match: /(ঝালকাঠি|jhalokati)/i, name: 'jhalokati' },
  { match: /(বরগুনা|barguna)/i, name: 'barguna' },
  { match: /(ভোলা|bhola)/i, name: 'bhola' },
  { match: /(কুড়িগ্রাম|kurigram)/i, name: 'kurigram' },
  { match: /(গাইবান্ধা|gaibandha)/i, name: 'gaibandha' },
  { match: /(লালমনিরহাট|lalmonirhat)/i, name: 'lalmonirhat' },
  { match: /(নীলফামারী|nilphamari)/i, name: 'nilphamari' },
  { match: /(পঞ্চগড়|panchagarh)/i, name: 'panchagarh' },
  { match: /(ঠাকুরগাঁও|thakurgaon)/i, name: 'thakurgaon' },
];

/**
 * Extracts and canonicalizes city name from address / zone for high EMQ.
 * Returns lowercase Romanized district name or 'dhaka'.
 */
export function extractCity(address = '', zoneName = '') {
  const combined = `${address || ''} ${zoneName || ''}`;
  for (const item of BD_CITIES) {
    if (item.match.test(combined)) {
      return item.name;
    }
  }
  return 'dhaka';
}

/**
 * Build a Facebook-style `user_data` object (also reused, reshaped, for
 * TikTok). Hashes PII; passes fbp/fbc/ip/ua raw. Empty fields are omitted so
 * we never send empty hashes (which would hurt match quality).
 *
 * @param {object} p
 * @param {string} p.phone  local or intl phone
 * @param {string} p.name   full name
 * @param {string} p.address
 * @param {string} p.zoneName
 * @param {string} p.city
 * @param {string} p.country 2-letter (default 'bd')
 * @param {string} p.externalId  raw session id (will be hashed)
 * @param {string} p.fbp
 * @param {string} p.fbc
 * @param {string} p.fbclid
 * @param {string} p.ip
 * @param {string} p.userAgent
 */
export function buildFacebookUserData(p = {}) {
  const ud = {};
  const e164 = toE164(p.phone); // 8801XXXXXXXXX or ''
  if (e164) ud.ph = [sha256Hex(e164)];

  if (p.name) {
    const { first, last } = splitName(p.name);
    if (first) ud.fn = [sha256Hex(norm(first))];
    if (last) ud.ln = [sha256Hex(norm(last))];
  }
  const city = p.city || extractCity(p.address, p.zoneName);
  if (city) ud.ct = [sha256Hex(norm(city))];
  ud.country = [sha256Hex(norm(p.country || 'bd'))];

  if (p.externalId) ud.external_id = [sha256Hex(p.externalId)];
  if (p.fbp) ud.fbp = p.fbp;
  if (p.fbc) {
    ud.fbc = p.fbc;
  } else if (p.fbclid) {
    ud.fbc = `fb.1.${Date.now()}.${p.fbclid}`;
  }
  if (p.ip) ud.client_ip_address = p.ip;
  if (p.userAgent) ud.client_user_agent = p.userAgent;

  return ud;
}

/**
 * TikTok Events API user context. TikTok wants hashed phone/email/external_id
 * and raw ip/user-agent/ttclid/ttp (their equivalent of fbp).
 */
export function buildTikTokUserData(p = {}) {
  const user = {};
  const e164 = toE164(p.phone);
  if (e164) user.phone = sha256Hex(e164);
  if (p.externalId) user.external_id = sha256Hex(p.externalId);
  if (p.ip) user.ip = p.ip;
  if (p.userAgent) user.user_agent = p.userAgent;
  if (p.ttclid) user.ttclid = p.ttclid;
  if (p.ttp || p._ttp) user.ttp = p.ttp || p._ttp;
  return user;
}

/**
 * Google Ads Enhanced Conversions user_data (GA4 MP). Google wants the phone
 * hashed in E.164 form (with +). Names/city optional.
 */
export function buildGoogleUserData(p = {}) {
  const ud = {};
  const e164 = toE164(p.phone);
  if (e164) ud.sha256_phone_number = [sha256Hex('+' + e164)];
  if (p.name) {
    const { first, last } = splitName(p.name);
    const address = {};
    if (first) address.first_name = sha256Hex(norm(first));
    if (last) address.last_name = sha256Hex(norm(last));
    const city = p.city || extractCity(p.address, p.zoneName);
    if (city) address.city = sha256Hex(norm(city));
    address.country = sha256Hex(norm(p.country || 'bd'));
    ud.address = [address];
  }
  return ud;
}

export default {
  sha256Hex,
  splitName,
  extractCity,
  buildFacebookUserData,
  buildTikTokUserData,
  buildGoogleUserData,
};
