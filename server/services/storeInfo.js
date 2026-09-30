import { toE164 } from '../utils/phone.js';

/**
 * Store contact info: several helpline numbers, each optionally reachable on
 * WhatsApp. Older data stored a single `phone` string — it is read as the
 * first number so nothing breaks. `phone` (first number) is kept in sync for
 * places that need one number, e.g. the SMS {{storePhone}} placeholder.
 */
export const MAX_STORE_PHONES = 5;

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

/** Sanitize whatever is stored/submitted into { phones, phone, address }. */
export function normalizeStoreInfo(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let list = Array.isArray(src.phones) ? src.phones : [];
  if (!list.length && src.phone) list = [{ number: src.phone, label: '', whatsapp: false }];

  const phones = list
    .map((p) => (typeof p === 'string' ? { number: p } : p || {}))
    .map((p) => ({
      number: clean(p.number, 20),
      label: clean(p.label, 40),
      whatsapp: !!p.whatsapp,
    }))
    .filter((p) => p.number)
    .slice(0, MAX_STORE_PHONES);

  return {
    phones,
    phone: phones[0]?.number || '',
    address: clean(src.address, 300),
  };
}

/**
 * Landing-page view model: adds ready-to-use tel: and wa.me links.
 * wa.me needs the international number without "+" (8801XXXXXXXXX).
 */
export function storePhoneLinks(storeInfo) {
  return normalizeStoreInfo(storeInfo).phones.map((p) => {
    const digits = p.number.replace(/[^\d+]/g, '');
    const intl = toE164(p.number) || digits.replace(/^\+/, '');
    return {
      ...p,
      telHref: 'tel:' + digits,
      waHref: p.whatsapp && intl ? 'https://wa.me/' + intl : '',
    };
  });
}

export default { normalizeStoreInfo, storePhoneLinks, MAX_STORE_PHONES };
