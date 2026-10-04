/**
 * Day boundaries and date keys in Bangladesh time, independent of the host's
 * timezone. Bangladesh Standard Time is a fixed UTC+6 (no daylight saving), so
 * a constant offset is exact — "today" always means the Dhaka calendar day.
 */
export const DHAKA_TZ = 'Asia/Dhaka';
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** YYYY-MM-DD for an instant, in Dhaka local time (default: now). */
export function dhakaYmd(date = new Date()) {
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The UTC instant of Dhaka midnight `daysAgo` days back (0 = today's midnight).
 * Use for range queries on createdAt so a "day" is a Dhaka calendar day.
 */
export function dhakaStartOf(daysAgo = 0) {
  const d = new Date(Date.now() + DHAKA_OFFSET_MS);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return new Date(d.getTime() - DHAKA_OFFSET_MS);
}

export default { DHAKA_TZ, DHAKA_OFFSET_MS, dhakaYmd, dhakaStartOf };
