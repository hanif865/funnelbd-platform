# FunnelBD — Production Deployment (VPS + Nginx + PM2 + Cloudflare)

লক্ষ্য: দ্রুত, নির্ভরযোগ্য, সস্তা হোস্টিং। মোবাইলে Lighthouse ৯০+, সার্ভার-সাইড ইভেন্ট ৯৯%+।

## ০. সার্ভার প্রস্তুতি (Ubuntu 22.04)
```bash
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
```
DB/Redis ম্যানেজড ব্যবহার করো: **MongoDB Atlas** + **Upstash Redis** (ব্রিফ অনুযায়ী)।

## ১. কোড + বিল্ড
```bash
git clone <repo> /var/www/funnelbd && cd /var/www/funnelbd
npm ci --omit=dev                                 # dev টুল (mongodb-memory-server) সার্ভারে লাগে না
npm run admin:install && npm run admin:build     # React → admin-panel/dist
cp .env.example .env                              # মান বসাও (নিচে দেখো)
npm run seed                                      # শুধু প্রথমবার (প্রোডাক্ট থাকলে নিজেই থেমে যাবে; প্রোডাকশনে শক্ত SEED_ADMIN_PASSWORD লাগবে)
```

### `.env` (production)
```
NODE_ENV=production
PORT=3000
BASE_URL=https://yourdomain.com
MONGODB_URI=<Atlas SRV string>
REDIS_URL=rediss://<Upstash>            # সেট করলে tracking queue + worker চালু
JWT_SECRET=<লম্বা র‍্যান্ডম>
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=<শক্ত পাসওয়ার্ড>
```

## ২. PM2 (web + worker আলাদা প্রসেস)
```bash
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup            # রিবুটে অটো-স্টার্ট
```
`REDIS_URL` সেট থাকলে worker tracking queue প্রসেস করবে; নাহলে web inline পাঠায় (worker idle)।

## ৩. Nginx (reverse proxy + static)
`/etc/nginx/sites-available/funnelbd`:
```nginx
server {
  listen 80;
  server_name yourdomain.com;

  client_max_body_size 16m;                # image upload (সার্ভার নিজে WebP-এ ছোট করে)

  # Uploaded images — unique filenames, never overwritten → 1 year immutable
  location /public/uploads/ {
    alias /var/www/funnelbd/public/uploads/;
    expires 365d;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
  # Static assets (landing css/js)
  location /public/ {
    alias /var/www/funnelbd/public/;
    expires 7d;
    add_header Cache-Control "public";
  }
  location /admin/assets/ {
    alias /var/www/funnelbd/admin-panel/dist/assets/;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/funnelbd /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## ৪. Cloudflare (ফ্রি CDN + SSL + ক্যাশ)
- ডোমেইন Cloudflare-এ যোগ করো, DNS A রেকর্ড → VPS IP (proxied 🟠)।
- SSL/TLS mode: **Full**। Cloudflare Origin Certificate ইনস্টল করে Nginx-এ 443 চালু করো (অথবা certbot)।
- অ্যাপ `trust proxy` অন করা আছে → `CF-Connecting-IP` থেকে আসল IP নেয় (tracking-এর জন্য জরুরি)।
- Caching: `/public/*` ও `/admin/assets/*` এজ-এ ক্যাশ হবে; HTML/`/api/*` ক্যাশ নয়।

## ৫. স্পিড চেকলিস্ট (মোবাইল Lighthouse ৯০+)
- ল্যান্ডিং পেজ SSR + মিনিমাল JS (tracker + checkout, দুটোই `defer`)।
- যেকোনো ফরম্যাটে ছবি আপলোড করো (JPG/PNG/GIF/AVIF/WebP, ১৫MB পর্যন্ত; iPhone থেকে ব্রাউজারে আপলোড করলে HEIC নিজেই JPG হয়ে যায়) — সার্ভার নিজে EXIF মুছে, ১২০০px-এ ছোট করে **WebP**-এ সেভ করে।
- পুরনো আপলোড (WebP-এর আগের) কনভার্ট করতে একবার: `npm run images:optimize`
- gzip চালু (compression middleware + Cloudflare)।
- অ্যাড চালানোর আগে PageSpeed Insights-এ মোবাইল স্কোর যাচাই।

## ৫.১ ডেটাবেস লোড (Atlas ফ্রি M0: ৫১২MB, ১০০ ops/sec)
- প্রোডাক্ট/অফার/ফর্ম/জোন ও সেটিংস মেমরিতে ৬০ সেকেন্ড ক্যাশ থাকে → ল্যান্ডিং ভিউতে ১টা, অর্ডারে ~৫টা DB অপারেশন। অ্যাডমিন থেকে কিছু সেভ করলে ক্যাশ সাথে সাথে মুছে যায়।
- worker প্রসেস আলাদা, তাই ট্র্যাকিং টোকেন বদলালে worker-এ সর্বোচ্চ ৬০ সেকেন্ড পর কার্যকর হয়।
- `event_logs` ৩০ দিন পর নিজে মুছে যায় (TTL) — স্টোরেজ ভরে অর্ডার বন্ধ হওয়ার ঝুঁকি নেই।

## ৫.২ সিস্টেম স্ট্যাটাস (ডেটাবেস/সার্ভার ত্রুটি)
- অ্যাডমিন প্যানেল → **সিস্টেম স্ট্যাটাস**: DB সংযোগ, স্টোরেজ %, আর সাম্প্রতিক ত্রুটি বাংলায় (কী করতে হবে সহ)।
- সমস্যা হলে সব পেজের উপরে লাল/হলুদ ব্যানার আসে; প্যানেল প্রতি ৬০ সেকেন্ডে চেক করে।
- DB বন্ধ থাকলেও অ্যাপ চালু থাকে এবং ১৫ সেকেন্ড পরপর নিজে আবার সংযোগের চেষ্টা করে।
- অন্য প্ল্যানে গেলে `.env`-এ `DB_STORAGE_LIMIT_MB` বসাও (ডিফল্ট ৫১২)।

## ৬. ব্যাকআপ
Atlas ফ্রি (M0) বা নিজের সার্ভারের MongoDB — কোনোটাতেই অটোমেটেড ব্যাকআপ **নেই**। `scripts/backup.sh` ডেটাবেস ডাম্প + আপলোড করা ছবি `./backups/<সময়>/`-এ রাখে (১৪ দিন):
```bash
bash scripts/backup.sh
```
crontab (রোজ রাত ৩টা): `0 3 * * * cd /var/www/funnelbd && bash scripts/backup.sh >> backups/backup.log 2>&1`

**সার্ভারের বাইরে কপি (জরুরি):** rclone ইনস্টল করে `.env`-এ `BACKUP_REMOTE=gdrive:funnelbd-backups` দিলে প্রতিটা ব্যাকআপ সেখানেও যায়। শুধু সার্ভারে থাকা ব্যাকআপ ডিস্ক নষ্ট হলে কাজে আসবে না।

রিস্টোর: `mongorestore --uri="$MONGODB_URI" --gzip --archive=backups/<সময়>/funnelbd.archive.gz --drop` এবং `tar -xzf backups/<সময়>/uploads.tar.gz -C public`

### নিজের সার্ভারে MongoDB চালালে
- `/etc/mongod.conf`: `bindIp: 127.0.0.1`, `security.authorization: enabled`, `wiredTiger.engineConfig.cacheSizeGB: 0.5` (অন্য সাইটের সাথে RAM ভাগাভাগি)।
- `.env`: `MONGODB_URI=mongodb://funnelbd:<পাসওয়ার্ড>@127.0.0.1:27017/funnelbd?authSource=funnelbd` এবং `DB_STORAGE_LIMIT_MB` বাড়াও।

## একই সার্ভারে আরেকটা ফানেল (দ্বিতীয় ডোমেইন)
প্রতিটা ফানেল আলাদা ফোল্ডারে আলাদা clone — কোড একই, ডেটা সম্পূর্ণ আলাদা।

| আলাদা রাখতে হবে | কোথায় |
|---|---|
| ফোল্ডার | `/var/www/<নাম>` |
| `APP_NAME` | `.env` — PM2 প্রসেসের নাম হয় `<নাম>-web` / `<নাম>-worker` |
| `PORT` | `.env` — প্রতিটার আলাদা (3000, 3001, …) |
| ডেটাবেস + ইউজার | MongoDB-তে নতুন database ও user, `.env`-এর `MONGODB_URI` |
| `JWT_SECRET`, `BASE_URL` | `.env` |
| nginx server block + SSL | `/etc/nginx/sites-available/<ডোমেইন>.conf` |

ছবি (`public/uploads`), ব্যাকআপ (`backups/`) ফোল্ডার আলাদা বলে নিজে থেকেই আলাদা থাকে। আপডেট দিতে প্রতিটা ফোল্ডারে আলাদা করে `git pull` + `pm2 reload ecosystem.config.cjs`।

## ৭. আপডেট ডিপ্লয়
```bash
git pull && npm ci --omit=dev && npm run admin:install && npm run admin:build
pm2 reload ecosystem.config.cjs  # zero-downtime
# public/js বা css বদলালে Cloudflare → Caching → Purge করো (ব্রাউজারে ৭ দিনের ক্যাশ)
```

## ৮. লঞ্চের আগে (ব্রিফ সেকশন ৭ — বাধ্যতামূলক)
- অ্যাডমিন → ট্র্যাকিং: তিন প্ল্যাটফর্মের Pixel ID + Token বসাও।
- FB Events Manager → Test Events, TikTok Test Event, GA4 DebugView — টেস্ট অর্ডার করে dedup + EMQ (≥৮) যাচাই।
- অ্যাডমিন → সেটিংস → SMS ও কুরিয়ার কনফিগার করো।
- এই টেস্ট পাস না করে অ্যাড চালাবে না।
