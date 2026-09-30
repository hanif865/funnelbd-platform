import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import {
  Product,
  Offer,
  FormField,
  DeliveryZone,
  Admin,
  Setting,
} from '../models/index.js';

/**
 * Seeds the connected database with sensible defaults. Assumes a live Mongoose
 * connection (does NOT connect/disconnect). Reused by both the `seed` CLI and
 * the in-memory dev bootstrap.
 *
 * Wipes config collections (products/offers/fields/zones) and re-creates them;
 * settings + admin are upserted. Orders are never touched.
 */
export async function seedDefaults() {
  // ── Product (demo modeled on the reference funnel) ──
  await Product.deleteMany({});
  const product = await Product.create({
    name: 'ম্যাগনেটিক ক্রস স্লিমিং বেল্ট',
    slug: 'magnetic-cross-slimming-belt',
    description:
      '<ul>' +
      '<li>ম্যাগনেট থাকার কারণে রক্ত সঞ্চালন বাড়ায়।</li>' +
      '<li>নিয়মিত ব্যবহারে পেটের মেদ কমাতে সহায়তা করে।</li>' +
      '<li>X-Shape Compression Design — কোমর ও পেটের ফ্যাট টাইট করে স্লিম লুক দেয়।</li>' +
      '<li>High Stretch Fabric — সহজে পরা যায়, ত্বকে জ্বালা করে না।</li>' +
      '<li>Posture Support — পিঠ সোজা রাখে ও ব্যথা কমায়।</li>' +
      '<li>Daily Use Friendly — ব্যায়াম, অফিস বা ঘরোয়া কাজে পরা যায়।</li>' +
      '<li>Sweat & Burn Effect — শরীরে ঘাম বাড়ায়, ফলে ফ্যাট দ্রুত বার্ন হয়।</li>' +
      '</ul>',
    images: [],
    content: {
      brandTagline: 'অরিজিনাল পণ্যের প্রতিশ্রুতি – আপনার বিশ্বস্ত অনলাইন হাট',
      subheadline: 'নারী-পুরুষ উভয়ই ব্যবহার করতে পারবেন',
      heroSubtext: 'ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ',
      buttonText: 'অর্ডার করুন',
      benefitTitle: 'Magnetic Slimming Belt কেন পরবেন?',
      usageTitle: 'কতক্ষণ ব্যবহার করবেন',
      usageHtml: '<ul><li>প্রতিদিন ৪–৮ ঘণ্টা ব্যবহার করা ভালো।</li><li>হাঁটা, বসা, অফিস কাজ, ঘরের কাজ—সবকিছুতেই ব্যবহার করা যায়।</li></ul>',
      infoBar: '২৮ থেকে ৪৮ সাইজের ( BLACK, SKIN) মোট ২ টি কালার পাচ্ছেন',
      reviewsTitle: 'সম্মানিত গ্রাহকদের মতামত',
      reviewImages: [],
      sizeChartImage: '',
      offersTitle: 'আপনার প্যাকেজ বাছাই করুন',
    },
    active: true,
  });

  // ── Offers ──
  await Offer.deleteMany({});
  await Offer.create([
    { productId: product._id, title: '২ পিস বেল্ট', price: 1099, comparePrice: 1398, quantity: 2, badge: 'বেস্ট ডিল', isDefault: true, order: 1, active: true },
    { productId: product._id, title: '১ পিস বেল্ট', price: 649, comparePrice: 849, quantity: 1, isDefault: false, order: 2, active: true },
  ]);

  // ── Core form fields (locked) + one sample dynamic field ──
  await FormField.deleteMany({});
  await FormField.create([
    { label: 'আপনার নাম', name: 'name', type: 'text', placeholder: 'পুরো নাম লিখুন', required: true, active: true, order: 1, isCore: true },
    { label: 'মোবাইল নম্বর', name: 'phone', type: 'text', placeholder: '01XXXXXXXXX', required: true, active: true, order: 2, isCore: true },
    { label: 'সম্পূর্ণ ঠিকানা', name: 'address', type: 'textarea', placeholder: 'গ্রাম/বাসা, থানা, জেলা', required: true, active: true, order: 3, isCore: true },
    { label: 'সাইজ', name: 'size', type: 'select', options: ['M', 'L', 'XL', '2XL', '3XL'], required: true, active: true, order: 4, isCore: false },
    { label: 'কালার নির্বাচন', name: 'color', type: 'select', options: ['Skin', 'Black'], required: true, active: true, order: 5, isCore: false },
  ]);

  // ── Delivery zones ──
  await DeliveryZone.deleteMany({});
  await DeliveryZone.create([
    { name: 'ঢাকার ভিতরে', charge: 60, isDefault: true, active: true, order: 1 },
    { name: 'ঢাকার বাইরে', charge: 120, isDefault: false, active: true, order: 2 },
  ]);

  // ── Default settings ──
  const defaultSettings = {
    duplicateCooldown: {
      enabled: true,
      hours: 24,
      message: 'আপনার অর্ডারটি আমরা ইতিমধ্যে পেয়েছি! আমাদের টিম শীঘ্রই যোগাযোগ করবে। জরুরি প্রয়োজনে কল করুন: 01XXXXXXXXX',
    },
    freeDelivery: { enabled: false, threshold: 0, allFree: false },
    storeInfo: { phone: '01XXXXXXXXX', address: 'ঢাকা, বাংলাদেশ' },
    sms: {
      enabled: false,
      apiUrl: '',
      method: 'GET',
      apiKey: '',
      senderId: '',
      paramNames: { to: 'to', message: 'msg', apiKey: 'api_key', sender: 'sender_id' },
      extraParams: {},
      followUpEnabled: false,
      followUpDelayMinutes: 30,
      templates: {
        confirmation: 'ধন্যবাদ {{name}}! আপনার অর্ডার #{{orderNumber}} ({{total}}৳) আমরা পেয়েছি। শীঘ্রই কল করে কনফার্ম করব।',
        followUp: 'আপনার অর্ডারটি সম্পন্ন হয়নি। অর্ডার করতে কল করুন: {{storePhone}}',
      },
    },
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true });
  }

  // ── Admin ──
  const passwordHash = await bcrypt.hash(config.seedAdmin.password, 10);
  await Admin.findOneAndUpdate(
    { email: config.seedAdmin.email.toLowerCase() },
    { name: config.seedAdmin.name, email: config.seedAdmin.email.toLowerCase(), passwordHash, role: 'admin', active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { adminEmail: config.seedAdmin.email, adminPassword: config.seedAdmin.password };
}

export default seedDefaults;
