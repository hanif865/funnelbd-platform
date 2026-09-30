/**
 * Bangladeshi phone number helpers.
 *
 * Accepts common input shapes and normalizes to two canonical forms:
 *  - local:  01XXXXXXXXX          (11 digits, for display + duplicate check)
 *  - e164:   8801XXXXXXXXX        (for hashing / CAPI identifiers)
 *
 * Valid BD mobile: operator prefix 013–019 after the leading 0.
 */

const LOCAL_RE = /^01[3-9]\d{8}$/;

/** Strip everything but digits, then collapse 880/+880 prefixes to local. */
export function toLocal(input) {
  if (!input) return '';
  let digits = String(input).replace(/\D/g, '');
  // +8801... or 8801... → 01...
  if (digits.startsWith('880')) digits = digits.slice(2); // leaves "01..."
  else if (digits.startsWith('01')) {
    // already local
  } else if (digits.startsWith('1') && digits.length === 10) {
    digits = '0' + digits; // 1XXXXXXXXX → 01XXXXXXXXX
  }
  return digits;
}

export function isValidBDPhone(input) {
  return LOCAL_RE.test(toLocal(input));
}

/** Returns normalized local form, or '' if invalid. */
export function normalizePhone(input) {
  const local = toLocal(input);
  return LOCAL_RE.test(local) ? local : '';
}

/** Returns 8801XXXXXXXXX form, or '' if invalid. */
export function toE164(input) {
  const local = normalizePhone(input);
  return local ? '88' + local : '';
}

export default { toLocal, isValidBDPhone, normalizePhone, toE164 };
