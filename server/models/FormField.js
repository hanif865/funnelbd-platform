import mongoose from 'mongoose';

export const FIELD_TYPES = ['text', 'number', 'textarea', 'radio', 'select', 'checkbox'];

/**
 * A dynamic checkout form field. Three core fields (name, phone, address)
 * are `isCore: true` — they cannot be deleted, only relabeled — because
 * order fulfilment and tracking both depend on them.
 */
const formFieldSchema = new mongoose.Schema(
  {
    // Which funnel (product) this field belongs to. Null = legacy/shared until
    // the default-funnel migration stamps it.
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
    label: { type: String, required: true, trim: true },
    // machine name used as the key in orders.customFields (and for core fields
    // maps to customer.{name,phone,address}). lowercase, no spaces.
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: FIELD_TYPES, default: 'text' },
    options: { type: [String], default: [] }, // for radio/select
    placeholder: { type: String, default: '' },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isCore: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'form_fields' }
);

formFieldSchema.index({ order: 1 });

export const FormField = mongoose.model('FormField', formFieldSchema);
export default FormField;
