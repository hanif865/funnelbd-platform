import mongoose from 'mongoose';

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "ঢাকার ভিতরে"
    charge: { type: Number, required: true, min: 0 },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'delivery_zones' }
);

deliveryZoneSchema.index({ order: 1 });

export const DeliveryZone = mongoose.model('DeliveryZone', deliveryZoneSchema);
export default DeliveryZone;
