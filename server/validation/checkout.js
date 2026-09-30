import { z } from 'zod';

/**
 * Base shape validation for the checkout payload. Dynamic per-field rules
 * (which fields are required, radio options, etc.) are enforced in
 * order.service against the live form_fields config — Zod here only guards
 * the envelope so the service works with well-typed data.
 */
export const trackingSchema = z
  .object({
    fbp: z.string().max(200).optional().default(''),
    fbc: z.string().max(200).optional().default(''),
    fbclid: z.string().max(300).optional().default(''),
    gclid: z.string().max(300).optional().default(''),
    ttclid: z.string().max(300).optional().default(''),
    ttp: z.string().max(200).optional().default(''),
    wbraid: z.string().max(300).optional().default(''),
    gbraid: z.string().max(300).optional().default(''),
    campaignId: z.string().max(200).optional().default(''),
    adId: z.string().max(200).optional().default(''),
    adsetId: z.string().max(200).optional().default(''),
    gaClientId: z.string().max(100).optional().default(''),
    eventId: z.string().max(100).optional().default(''),
    utm: z
      .object({
        source: z.string().max(200).optional().default(''),
        medium: z.string().max(200).optional().default(''),
        campaign: z.string().max(200).optional().default(''),
        content: z.string().max(200).optional().default(''),
        term: z.string().max(200).optional().default(''),
        id: z.string().max(200).optional().default(''),
      })
      .partial()
      .optional()
      .default({}),
  })
  .partial()
  .optional()
  .default({});

export const checkoutSchema = z.object({
  offerId: z.string().min(1, 'অফার সিলেক্ট করুন'),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  deliveryZoneId: z.string().min(1, 'ডেলিভারি এলাকা সিলেক্ট করুন'),
  // No `discount` here on purpose: it is decided server-side (exit-intent
  // offer recorded per session). Any client-sent value is stripped.
  // All form-field answers keyed by field.name (includes name/phone/address).
  fields: z.record(z.string(), z.any()).default({}),
  tracking: trackingSchema,
});

/**
 * Draft (incomplete order) payload — everything optional since the user is
 * mid-typing. Used in Phase 3 but defined here alongside the checkout schema.
 */
export const draftSchema = z.object({
  offerId: z.string().optional(),
  fields: z.record(z.string(), z.any()).default({}),
  tracking: trackingSchema,
});

export default { checkoutSchema, draftSchema, trackingSchema };
