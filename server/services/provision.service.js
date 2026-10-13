import { Product, Offer, FormField, DeliveryZone } from '../models/index.js';

/**
 * Seed a brand-new account with a working starter funnel so it can take orders
 * immediately: one product at /funnel-step/checkout/, the three core checkout
 * fields plus size/colour, two delivery zones and one offer. All stamped with
 * the account. Customer-facing copy stays in Bangla; the owner edits it after.
 */
export async function provisionStarterFunnel(accountId, { name = 'আমার প্রোডাক্ট' } = {}) {
  const product = await Product.create({
    accountId,
    name,
    slug: 'checkout',
    active: true,
    content: {
      offersTitle: 'আপনার প্যাকেজ বাছাই করুন',
      buttonText: 'অর্ডার কনফার্ম করুন',
    },
  });

  await FormField.create([
    { accountId, productId: product._id, label: 'আপনার নাম', name: 'name', type: 'text', placeholder: 'পুরো নাম লিখুন', required: true, active: true, order: 1, isCore: true },
    { accountId, productId: product._id, label: 'মোবাইল নম্বর', name: 'phone', type: 'text', placeholder: '01XXXXXXXXX', required: true, active: true, order: 2, isCore: true },
    { accountId, productId: product._id, label: 'সম্পূর্ণ ঠিকানা', name: 'address', type: 'textarea', placeholder: 'গ্রাম/বাসা, থানা, জেলা', required: true, active: true, order: 3, isCore: true },
  ]);

  await DeliveryZone.create([
    { accountId, productId: product._id, name: 'ঢাকার ভিতরে', charge: 60, isDefault: true, active: true, order: 1 },
    { accountId, productId: product._id, name: 'ঢাকার বাইরে', charge: 120, isDefault: false, active: true, order: 2 },
  ]);

  await Offer.create({ accountId, productId: product._id, title: '১ পিস', price: 0, quantity: 1, isDefault: true, active: true, order: 1 });

  return product;
}

export default { provisionStarterFunnel };
