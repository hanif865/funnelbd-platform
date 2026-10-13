import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    name: { type: String, required: true, trim: true }, // hero headline
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '' }, // benefit rich text (HTML)
    images: { type: [String], default: [] }, // hero gallery
    // Landing-page content editable from the admin Page Editor.
    content: {
      brandTagline: { type: String, default: 'অরিজিনাল পণ্যের প্রতিশ্রুতি – আপনার বিশ্বস্ত অনলাইন হাট' },
      checkoutBadge: { type: String, default: '⚡ দ্রুততম চেকআউট' },
      checkoutTitle: { type: String, default: 'অর্ডার কনফার্ম করতে নিচের ফর্মটি পূরণ করুন' },
      checkoutSubtitle: { type: String, default: 'সঠিক তথ্য দিয়ে ফর্মটি পূরণ করুন, দ্রুততম সময়ে আপনার ঠিকানায় পণ্য পৌঁছে দেওয়া হবে।' },
      offersTitle: { type: String, default: 'আপনার পছন্দের প্রোডাক্ট সিলেক্ট করুন' },
      buttonText: { type: String, default: 'অর্ডার কনফার্ম করুন' },
      sizeChartImage: { type: String, default: '' },
      heroBadge1: { type: String, default: '🔥 ধামাকা অফার' },
      heroBadge2: { type: String, default: '⭐ ১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি' },
      trendingBadge: { type: String, default: '🔥 হট ট্রেন্ডিং কালেকশন ২০২৬' },
      subheadline: { type: String, default: '' },      // bold headline under gallery
      heroSubtext: { type: String, default: '' },       // quote / description under headline
      heroHighlight: { type: String, default: 'ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ' },
      videoUrl: { type: String, default: '' },          // optional YouTube shorts / video embed
      benefitTitle: { type: String, default: 'কেন কিনবেন?' },
      usageTitle: { type: String, default: 'কতক্ষণ ব্যবহার করবেন' },
      usageHtml: { type: String, default: '' },         // usage instructions (HTML)
      infoBar: { type: String, default: '' },           // black bar (size/color info)
      reviewsTitle: { type: String, default: 'সম্মানিত গ্রাহকদের মতামত' },
      reviewImages: { type: [String], default: [] },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'products' }
);

export const Product = mongoose.model('Product', productSchema);
export default Product;
