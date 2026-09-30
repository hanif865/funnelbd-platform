import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api.js';
import ImageUploader from '../components/ImageUploader.jsx';

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'আপলোড ব্যর্থ');
  return data.url;
}

export default function PageEditor() {
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/product').then((d) => setP(normalize(d.product)));
  }, []);

  function normalize(prod) {
    if (!prod) return null;
    return {
      ...prod,
      content: {
        brandTagline: 'অরিজিনাল পণ্যের প্রতিশ্রুতি – আপনার বিশ্বস্ত অনলাইন হাট',
        checkoutBadge: '⚡ দ্রুততম চেকআউট',
        checkoutTitle: 'অর্ডার কনফার্ম করতে নিচের ফর্মটি পূরণ করুন',
        checkoutSubtitle: 'সঠিক তথ্য দিয়ে ফর্মটি পূরণ করুন, দ্রুততম সময়ে আপনার ঠিকানায় পণ্য পৌঁছে দেওয়া হবে।',
        offersTitle: 'আপনার পছন্দের প্রোডাক্ট সিলেক্ট করুন',
        buttonText: 'অর্ডার কনফার্ম করুন',
        sizeChartImage: '',
        heroBadge1: '🔥 ধামাকা অফার',
        heroBadge2: '⭐ ১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি',
        trendingBadge: '🔥 হট ট্রেন্ডিং কালেকশন ২০২৬',
        subheadline: '',
        heroSubtext: '',
        heroHighlight: 'ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ',
        videoUrl: '',
        benefitTitle: 'কেন কিনবেন?',
        usageTitle: 'কতক্ষণ ব্যবহার করবেন',
        usageHtml: '',
        infoBar: '',
        reviewsTitle: 'সম্মানিত গ্রাহকদের মতামত',
        reviewImages: [],
        ...(prod.content || {}),
      },
    };
  }

  function setContent(patch) {
    setP((x) => ({ ...x, content: { ...x.content, ...patch } }));
  }

  async function addImage(target, file) {
    try {
      const url = await uploadImage(file);
      if (target === 'gallery') {
        setP((x) => ({ ...x, images: [...(x.images || []), url] }));
      } else {
        setContent({ reviewImages: [...(p.content.reviewImages || []), url] });
      }
    } catch (e) {
      setMsg(e.message);
    }
  }

  function removeImage(target, i) {
    if (target === 'gallery') {
      setP((x) => ({ ...x, images: x.images.filter((_, j) => j !== i) }));
    } else {
      setContent({ reviewImages: p.content.reviewImages.filter((_, j) => j !== i) });
    }
  }

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api('/product', {
        method: 'PUT',
        body: {
          name: p.name,
          description: p.description,
          images: p.images,
          content: p.content,
        },
      });
      setMsg('পাবলিশ হয়েছে — লাইভ পেজে চেঞ্জ চলে গেছে।');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <p className="muted">লোড হচ্ছে…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>ল্যান্ডিং পেজ ও ফানেল এডিটর</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
            লাইভ ফানেলের ভিজ্যুয়াল ক্রমানুসারে প্রতিটি সেকশন সাজানো হয়েছে।
          </p>
        </div>
        <a className="btn-ghost" href="/funnel-step/checkout/" target="_blank" rel="noreferrer">লাইভ পেজ ↗</a>
      </div>

      {/* ── ১. ব্র্যান্ড ও টপ বার ── */}
      <div className="card">
        <h3>১. ব্র্যান্ড ও টপ বার (Top Bar)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          পেজের সর্বউপরে থাকা লাল রঙের ব্যানার ও মূল প্রোডাক্ট হেডলাইন।
        </p>
        <div className="fld">
          <label>টপ বার টেক্সট / জরুরি ঘোষণা</label>
          <input
            value={p.content.brandTagline}
            onChange={(e) => setContent({ brandTagline: e.target.value })}
            placeholder="যেমন: অরিজিনাল পণ্যের প্রতিশ্রুতি – আপনার বিশ্বস্ত অনলাইন হাট"
          />
        </div>
        <div className="fld">
          <label>মূল প্রোডাক্টের নাম (টাইটেল)</label>
          <input
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            placeholder="যেমন: Sweat Slim Belt Plus (Original Imported)"
          />
        </div>
      </div>

      {/* ── ২. চেকআউট ফর্ম কনফিগারেশন (পেজের শীর্ষে) ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <h3 style={{ margin: 0 }}>২. চেকআউট ফর্ম কনফিগারেশন (পেজের শীর্ষে প্রদর্শিত)</h3>
          <span style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 999, fontWeight: 700 }}>
            Khaleshaat Top Checkout
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          ল্যান্ডিং পেজের শীর্ষে থাকা মূল চেকআউট ফর্মের টাইটেল, অফার হেডার ও বাটন টেক্সট এখান থেকে পরিবর্তন করুন।
        </p>

        <div className="two-col">
          <div className="fld">
            <label>চেকআউট ব্যাজ টেক্সট</label>
            <input
              value={p.content.checkoutBadge}
              onChange={(e) => setContent({ checkoutBadge: e.target.value })}
              placeholder="যেমন: ⚡ দ্রুততম চেকআউট"
            />
          </div>
          <div className="fld">
            <label>অর্ডার বাটন টেক্সট</label>
            <input
              value={p.content.buttonText}
              onChange={(e) => setContent({ buttonText: e.target.value })}
              placeholder="যেমন: অর্ডার কনফার্ম করুন"
            />
          </div>
        </div>

        <div className="fld">
          <label>চেকআউট মূল শিরোনাম (ফর্ম হেডার)</label>
          <input
            value={p.content.checkoutTitle}
            onChange={(e) => setContent({ checkoutTitle: e.target.value })}
            placeholder="যেমন: অর্ডার কনফার্ম করতে নিচের ফর্মটি পূরণ করুন"
          />
        </div>

        <div className="fld">
          <label>চেকআউট সাব-শিরোনাম (ডেস্কটপ)</label>
          <input
            value={p.content.checkoutSubtitle}
            onChange={(e) => setContent({ checkoutSubtitle: e.target.value })}
            placeholder="যেমন: সঠিক তথ্য দিয়ে ফর্মটি পূরণ করুন, দ্রুততম সময়ে আপনার ঠিকানায় পণ্য পৌঁছে দেওয়া হবে।"
          />
        </div>

        <div className="fld">
          <label>অফার / প্যাকেজ সিলেকশন টাইটেল</label>
          <input
            value={p.content.offersTitle}
            onChange={(e) => setContent({ offersTitle: e.target.value })}
            placeholder="যেমন: আপনার পছন্দের প্রোডাক্ট সিলেক্ট করুন"
          />
        </div>

        <div className="fld">
          <label>সাইজ চার্ট ব্যানার ছবি (ঐচ্ছিক)</label>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: '0.84rem' }}>
            চেকআউট ফর্মের ঠিক নিচে কাস্টমার সাইজ রেফারেন্সের জন্য প্রদর্শিত হবে।
          </p>
          <ImageUploader value={p.content.sizeChartImage} onChange={(url) => setContent({ sizeChartImage: url })} />
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginTop: 14 }}>
          <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: 6 }}>💡 চেকআউট ফর্ম সম্পর্কিত অন্যান্য সেটিংস:</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <Link to="/offers" style={{ fontWeight: 600, color: '#e63946' }}>🛍️ অফার ও প্যাকেজ প্রাইসিং এডিট করুন ↗</Link>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <Link to="/form-builder" style={{ fontWeight: 600, color: '#e63946' }}>📝 ফর্মের ফিল্ড (সাইজ, কালার ইত্যাদি) এডিট করুন ↗</Link>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <Link to="/delivery" style={{ fontWeight: 600, color: '#e63946' }}>🚚 ডেলিভারি চার্জ নির্ধারণ করুন ↗</Link>
          </div>
        </div>
      </div>

      {/* ── ৩. প্রোডাক্ট হিরো শোকেস ও স্লাইডার ── */}
      <div className="card">
        <h3>৩. প্রোডাক্ট হিরো শোকেস ও গ্যালারি স্লাইডার</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          চেকআউট ফর্মের নিচে থাকা বড় প্রোডাক্ট শোকেস, স্লাইডার ইমেজ, হাইলাইটস ও ব্যাজসমূহ।
        </p>

        <div className="fld">
          <label>গ্যালারি ছবি (স্লাইডার)</label>
          <ImageGrid images={p.images || []} onAdd={(f) => addImage('gallery', f)} onRemove={(i) => removeImage('gallery', i)} />
        </div>

        <div className="two-col">
          <div className="fld">
            <label>স্লাইডারের উপরের ব্যাজ ১ (লাল)</label>
            <input
              value={p.content.heroBadge1}
              onChange={(e) => setContent({ heroBadge1: e.target.value })}
              placeholder="যেমন: 🔥 ধামাকা অফার"
            />
          </div>
          <div className="fld">
            <label>স্লাইডারের উপরের ব্যাজ ২ (গোল্ডেন)</label>
            <input
              value={p.content.heroBadge2}
              onChange={(e) => setContent({ heroBadge2: e.target.value })}
              placeholder="যেমন: ⭐ ১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি"
            />
          </div>
        </div>

        <div className="fld">
          <label>ট্রেন্ডিং কালেকশন ব্যাজ (শিরোনামের উপরে)</label>
          <input
            value={p.content.trendingBadge}
            onChange={(e) => setContent({ trendingBadge: e.target.value })}
            placeholder="যেমন: 🔥 হট ট্রেন্ডিং কালেকশন ২০২৬"
          />
        </div>

        <div className="fld">
          <label>বোল্ড সাব-হেডলাইন (প্রোডাক্ট টাইটেলের নিচে)</label>
          <input
            value={p.content.subheadline}
            onChange={(e) => setContent({ subheadline: e.target.value })}
            placeholder="যেমন: নারী-পুরুষ উভয়ই ব্যবহার করতে পারবেন"
          />
        </div>

        <div className="fld">
          <label>কোটেশন বা সাব-টেক্সট (প্রাইস বক্সের নিচে)</label>
          <input
            value={p.content.heroSubtext}
            onChange={(e) => setContent({ heroSubtext: e.target.value })}
            placeholder="যেমন: ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ"
          />
        </div>

        <div className="fld">
          <label>বড় হাইলাইট হেডলাইন (কল টু অ্যাকশন বাটনদ্বয়ের উপরে)</label>
          <input
            value={p.content.heroHighlight}
            onChange={(e) => setContent({ heroHighlight: e.target.value })}
            placeholder="যেমন: ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ"
          />
        </div>
      </div>

      {/* ── ৪. প্রোডাক্ট ভিডিও সেকশন ── */}
      <div className="card">
        <h3>৪. প্রোডাক্ট ভিডিও সেকশন (ঐচ্ছিক)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          ইউটিউব ভিডিও বা Shorts লিংক দিন। কাস্টমার লাইভ পেজে প্রোডাক্টের ডেমো ভিডিও দেখতে পাবে (খালি রাখলে ভিডিও সেকশনটি হাইড থাকবে)।
        </p>
        <div className="fld">
          <label>ইউটিউব ভিডিও / Shorts লিঙ্ক</label>
          <input
            value={p.content.videoUrl}
            onChange={(e) => setContent({ videoUrl: e.target.value })}
            placeholder="যেমন: https://www.youtube.com/watch?v=... বা https://youtube.com/shorts/..."
          />
        </div>
      </div>

      {/* ── ৫. বেনিফিট সেকশন ── */}
      <div className="card">
        <h3>৫. বেনিফিট সেকশন (কেন কিনবেন)</h3>
        <div className="fld">
          <label>সেকশন টাইটেল</label>
          <input
            value={p.content.benefitTitle}
            onChange={(e) => setContent({ benefitTitle: e.target.value })}
            placeholder="যেমন: কেন কিনবেন?"
          />
        </div>
        <div className="fld">
          <label>বিস্তারিত সুবিধা (HTML সমর্থিত — যেমন &lt;ul&gt;&lt;li&gt;…&lt;/li&gt;&lt;/ul&gt;)</label>
          <textarea
            rows={5}
            value={p.description}
            onChange={(e) => setP({ ...p, description: e.target.value })}
            placeholder="<ul><li>১০০% অরিজিনাল চায়না থেকে ইমপোর্ট</li><li>নিয়মিত ব্যবহারে পেটের মেদ কমাতে সহায়তা করে</li></ul>"
          />
        </div>
      </div>

      {/* ── ৬. ব্যবহারবিধি সেকশন ── */}
      <div className="card">
        <h3>৬. ব্যবহারবিধি সেকশন (ঐচ্ছিক)</h3>
        <div className="fld">
          <label>সেকশন টাইটেল</label>
          <input
            value={p.content.usageTitle}
            onChange={(e) => setContent({ usageTitle: e.target.value })}
            placeholder="যেমন: কতক্ষণ ব্যবহার করবেন"
          />
        </div>
        <div className="fld">
          <label>ব্যবহারের নিয়মাবলী (HTML — খালি রাখলে সেকশনটি হাইড থাকবে)</label>
          <textarea
            rows={3}
            value={p.content.usageHtml}
            onChange={(e) => setContent({ usageHtml: e.target.value })}
            placeholder="<ul><li>প্রতিদিন ৪–৮ ঘণ্টা ব্যবহার করা ভালো।</li><li>হাঁটা, বসা, অফিস কাজ—সবকিছুতেই পরা যায়।</li></ul>"
          />
        </div>
      </div>

      {/* ── ৭. কালো ইনফো বার ── */}
      <div className="card">
        <h3>৭. কালো ইনফো বার (ঐচ্ছিক)</h3>
        <div className="fld">
          <label>ইনফো টেক্সট (যেমন সাইজ/কালার তথ্য — খালি রাখলে দেখাবে না)</label>
          <input
            value={p.content.infoBar}
            onChange={(e) => setContent({ infoBar: e.target.value })}
            placeholder="যেমন: ২৮ থেকে ৪৮ সাইজের (BLACK, SKIN) মোট ২টি কালার পাচ্ছেন"
          />
        </div>
      </div>

      {/* ── ৮. কাস্টমার রিভিউ সেকশন ── */}
      <div className="card">
        <h3>৮. কাস্টমার রিভিউ সেকশন</h3>
        <div className="fld">
          <label>সেকশন টাইটেল</label>
          <input
            value={p.content.reviewsTitle}
            onChange={(e) => setContent({ reviewsTitle: e.target.value })}
            placeholder="যেমন: সম্মানিত গ্রাহকদের মতামত"
          />
        </div>
        <label>রিভিউ স্ক্রিনশট ও ছবিসমূহ</label>
        <ImageGrid
          images={p.content.reviewImages || []}
          onAdd={(f) => addImage('review', f)}
          onRemove={(i) => removeImage('review', i)}
        />
      </div>

      {/* ── সেভ ও পাবলিশ বার ── */}
      <div className="save-bar sticky-save">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'পাবলিশ হচ্ছে…' : 'Publish / সেভ করুন'}
        </button>
        {msg && <span className="ok-text">{msg}</span>}
      </div>
    </div>
  );
}

function ImageGrid({ images, onAdd, onRemove }) {
  return (
    <div className="img-grid">
      {images.map((src, i) => (
        <div className="img-cell" key={i}>
          <img src={src} alt="" />
          <button className="img-remove" onClick={() => onRemove(i)}>✕</button>
        </div>
      ))}
      <label className="img-add">
        + ছবি
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            if (e.target.files[0]) {
              onAdd(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />
      </label>
    </div>
  );
}
