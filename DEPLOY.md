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
npm ci
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

  client_max_body_size 6m;                 # image upload

  # Static assets — long cache (fingerprinted admin build + uploads)
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
- ছবি **WebP**-এ আপলোড করো, বড় ছবি এড়াও (৪MB লিমিট)।
- gzip চালু (compression middleware + Cloudflare)।
- অ্যাড চালানোর আগে PageSpeed Insights-এ মোবাইল স্কোর যাচাই।

## ৬. ব্যাকআপ
Atlas-এ অটোমেটেড ব্যাকআপ আছে। অতিরিক্ত লোকাল ডাম্প:
```bash
bash scripts/backup.sh          # mongodump → ./backups/ (cron-এ রোজ চালাও)
```
crontab: `0 3 * * * cd /var/www/funnelbd && bash scripts/backup.sh`

## ৭. আপডেট ডিপ্লয়
```bash
git pull && npm ci && npm run admin:build
pm2 reload ecosystem.config.cjs  # zero-downtime
# public/js বা css বদলালে Cloudflare → Caching → Purge করো (ব্রাউজারে ৭ দিনের ক্যাশ)
```

## ৮. লঞ্চের আগে (ব্রিফ সেকশন ৭ — বাধ্যতামূলক)
- অ্যাডমিন → ট্র্যাকিং: তিন প্ল্যাটফর্মের Pixel ID + Token বসাও।
- FB Events Manager → Test Events, TikTok Test Event, GA4 DebugView — টেস্ট অর্ডার করে dedup + EMQ (≥৮) যাচাই।
- অ্যাডমিন → সেটিংস → SMS ও কুরিয়ার কনফিগার করো।
- এই টেস্ট পাস না করে অ্যাড চালাবে না।
