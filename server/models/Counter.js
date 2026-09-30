import mongoose from 'mongoose';

/**
 * Atomic sequence generator. Used for order numbers so concurrent submits
 * never collide. `_id` is the sequence name (e.g. "orderNumber").
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { collection: 'counters' }
);

/**
 * Returns the next value for a named sequence, creating it if missing.
 * Seeded so the first order number is `start` (default 1001).
 */
counterSchema.statics.next = async function (name, start = 1001) {
  const doc = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  // First increment on a fresh (0) counter yields 1; offset to `start`.
  return doc.seq === 1 ? start : start + doc.seq - 1;
};

export const Counter = mongoose.model('Counter', counterSchema);
export default Counter;
