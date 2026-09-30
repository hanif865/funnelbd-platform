# FunnelBD

বাংলাদেশি সিঙ্গেল-প্রোডাক্ট Cash-on-Delivery সেলস ফানেল — দ্রুত ল্যান্ডিং পেজ, নিখুঁত ট্র্যাকিং (Phase 2), সহজ অ্যাডমিন।

## স্ট্যাক
- **Backend:** Node.js + Express (ESM) + Mongoose (MongoDB Atlas)
- **Landing page:** সার্ভার-রেন্ডারড EJS + ভ্যানিলা JS (হালকা, দ্রুত)
- **Admin panel:** React + Vite (`/admin`-এ static serve)
- **Queue (Phase 2):** BullMQ + Upstash Redis
- **Process:** PM2 — web ও worker আলাদা

## দ্রুত শুরু

### ১. ইনস্টল
```bash
npm install
npm run admin:install
```

### ২. এনভায়রনমেন্ট
`.env` অলরেডি লোকাল MongoDB-তে সেট করা (`mongodb://127.0.0.1:27017/funnelbd`), `JWT_SECRET` জেনারেট করা আছে।

### ৩. স্থায়ী লোকাল MongoDB (ডিফল্ট সেটআপ)
পোর্টেবল MongoDB 6.0 ইতিমধ্যে `.local-mongo/`-এ ইনস্টল করা, ডেটা `.mongo-data/`-এ স্থায়ীভাবে থাকে (admin/সার্ভিস লাগে না)।

**দুটো টার্মিনাল** — একটাতে DB, একটাতে অ্যাপ:
```bash
# টার্মিনাল ১ — DB চালু রাখো
npm run db:start      # mongod → 127.0.0.1:27017, persistent .mongo-data

# টার্মিনাল ২ — একবার সিড, তারপর অ্যাপ
npm run seed          # ডিফল্ট প্রোডাক্ট, অফার, ফর্ম ফিল্ড, জোন, অ্যাডমিন
npm run admin:build   # React অ্যাডমিন প্যানেল বিল্ড
npm run dev           # http://localhost:3000
```
> ল্যান্ডিং পেজ: `http://localhost:3000` · অ্যাডমিন: `http://localhost:3000/admin`

### বিকল্প: Atlas ক্লাউড
`.env`-এ `MONGODB_URI` Atlas string-এ বদলাও, তারপর `npm run seed && npm run dev` (`db:start` লাগবে না)।

### বিকল্প: দ্রুত ট্রায়াল (in-memory, ephemeral)
```bash
npm run dev:mem       # ephemeral in-memory Mongo, অটো-সিড, ডেটা টেকে না
```
> Windows-এ 6.0.14 বাইনারি ব্যবহার করে (8.x নতুন VC++ redist ছাড়া ক্র্যাশ করে)।

## অ্যাডমিন লগইন (ডিফল্ট)
`admin@funnelbd.local` / `admin1234` — `.env`-এ `SEED_ADMIN_*` দিয়ে বদলানো যায়।

## স্ক্রিপ্ট
| কমান্ড | কাজ |
|--------|-----|
| `npm run db:start` | স্থায়ী লোকাল MongoDB (portable, `.mongo-data`) |
| `npm run dev` | web সার্ভার, watch মোড |
| `npm run dev:mem` | in-memory Mongo + অটো-সিড (ephemeral) |
| `npm run seed` | কনফিগার করা DB-তে ডিফল্ট ডেটা |
| `npm run worker` | BullMQ worker (Phase 2) |
| `npm run admin:dev` | Vite dev server (`:5173`, `/api` → `:3000` প্রক্সি) |
| `npm run admin:build` | React অ্যাডমিন প্রোডাকশন বিল্ড |

## স্ট্যাটাস
- ✅ **Phase 1 (কোর):** ল্যান্ডিং পেজ, লাইভ টোটাল, AJAX অর্ডার + সার্ভার-সাইড ভ্যালিডেশন, ডুপ্লিকেট কুলডাউন, atomic order#, অ্যাডমিন লগইন + Orders (list/detail/status/notes)।
- ✅ **Phase 2 (ট্র্যাকিং):** FB/GA4/TikTok dual-side pixels + server-side (CAPI/MP/Events API), shared event_id dedup, SHA-256 hashed identifiers (EMQ), retry (৩x), event_logs + অ্যাডমিন Tracking Settings ও Event Log viewer।
- ✅ **Phase 3 (সেলস বুস্টার):** Incomplete order ক্যাপচার (debounced draft) + রিকভারি পেজ (call/WhatsApp/SMS/convert), configurable SMS gateway (confirmation + auto follow-up sweep), Form Builder (reorder + core-lock + live preview), Product & Offers, Delivery Settings + free-delivery, Landing Page Editor (content + image upload), General Settings।
- ✅ **Phase 4 (অপারেশন):** Dashboard (রিপোর্ট + ৩০-দিন SVG গ্রাফ + সোর্স ব্রেকডাউন + conversion), Courier (Steadfast/Pathao এক-ক্লিক consignment) + fraud check (অর্ডার-হিস্ট্রি + optional external), bulk actions + CSV export, staff roles (Admin/Staff enforcement), gzip compression, deployment runbook ([DEPLOY.md](DEPLOY.md)) + backup script।

**চার ফেজই সম্পূর্ণ — প্রোডাকশন-রেডি।** ডিপ্লয়: [DEPLOY.md](DEPLOY.md)।

## ট্র্যাকিং সেটআপ (Phase 2)
1. অ্যাডমিন প্যানেল → **ট্র্যাকিং** → প্রতিটা প্ল্যাটফর্মের Pixel ID + Access Token বসাও, চালু করো।
2. **Queue:** `REDIS_URL` (Upstash) সেট থাকলে সার্ভার-সাইড ইভেন্ট BullMQ queue দিয়ে যায় — তখন `npm run worker` আলাদা প্রসেসে চালাও। `REDIS_URL` না থাকলে ইভেন্ট web প্রসেসেই inline যায় (worker লাগে না)।
3. **টেস্ট প্রটোকল:** FB Events Manager → Test Events (testEventCode বসিয়ে), TikTok Test Event, GA4 DebugView — টেস্ট অর্ডার করে দেখো ইভেন্ট যাচ্ছে ও dedup হচ্ছে। ব্যর্থ হলে অ্যাডমিন → ট্র্যাকিং → **ইভেন্ট লগ**-এ কারণ দেখাবে।

বিস্তারিত প্ল্যান: `.claude/plans/` (সেশন প্ল্যান ফাইল)।
