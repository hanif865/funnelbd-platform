import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api.js';
import { useFunnelApi, useFunnel } from '../funnel.jsx';
import { Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
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
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

export default function PageEditor() {
  const fapi = useFunnelApi();
  const { current } = useFunnel();
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    setP(null);
    fapi('/product').then((d) => setP(normalize(d.product)));
  }, [fapi]);

  useEffect(() => {
    api('/ai/status').then((d) => setAiConfigured(!!d.configured)).catch(() => {});
  }, []);

  // Apply AI-generated copy into the editor (not saved until the user Publishes).
  function applyAi(gen) {
    setP((x) => ({
      ...x,
      name: gen.name || x.name,
      description: gen.description || x.description,
      content: { ...x.content, ...(gen.content || {}) },
    }));
    // Leave the modal open so it can show the suggested offers; the user closes it.
    setMsg('AI draft applied — review the fields, then Publish.');
  }

  function normalize(prod) {
    if (!prod) return null;
    // Default values below are the live, customer-facing page content, so they
    // stay in Bangla. Only the admin editor labels around them are in English.
    return {
      ...prod,
      content: {
        brandTagline: 'অরিজিনাল পণ্যের প্রতিশ্রুতি – আপনার বিশ্বস্ত অনলাইন হাট',
        checkoutBadge: '⚡ দ্রুততম চেকআউট',
        checkoutTitle: 'অর্ডার কনফার্ম করতে নিচের ফর্মটি পূরণ করুন',
        checkoutSubtitle: 'সঠিক তথ্য দিয়ে ফর্মটি পূরণ করুন, দ্রুততম সময়ে আপনার ঠিকানায় পণ্য পৌঁছে দেওয়া হবে।',
        offersTitle: 'আপনার পছন্দের প্রোডাক্ট সিলেক্ট করুন',
        buttonText: 'অর্ডার কনফার্ম করুন',
        sizeChartImage: '',
        heroBadge1: '🔥 ধামাকা অফার',
        heroBadge2: '⭐ ১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি',
        trendingBadge: '🔥 হট ট্রেন্ডিং কালেকশন ২০২৬',
        subheadline: '',
        heroSubtext: '',
        heroHighlight: 'ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ',
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
      await fapi('/product', {
        method: 'PUT',
        body: {
          name: p.name,
          description: p.description,
          images: p.images,
          content: p.content,
        },
      });
      setMsg('Published — the change is live on the page.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Landing page &amp; funnel editor</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
            Each section is arranged in the visual order of the live funnel.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {aiConfigured && (
            <button className="btn-primary" onClick={() => setAiOpen(true)} title="Draft the whole page with AI">
              ✨ Generate with AI
            </button>
          )}
          <a className="btn-ghost" href={current?.slug ? `/funnel-step/${current.slug}/` : '/funnel-step/checkout/'} target="_blank" rel="noreferrer">Live page <Icon name="external" size={15} /></a>
        </div>
      </div>

      {aiOpen && <AiModal initialName={p.name} onClose={() => setAiOpen(false)} onApply={applyAi} />}

      {/* ── 1. Brand & top bar ── */}
      <div className="card">
        <h3>1. Brand &amp; top bar</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          The red banner at the very top of the page and the main product headline.
        </p>
        <div className="fld">
          <label>Top-bar text / urgent announcement</label>
          <input
            value={p.content.brandTagline}
            onChange={(e) => setContent({ brandTagline: e.target.value })}
            placeholder="e.g. অরিজিনাল পণ্যের প্রতিশ্রুতি – আপনার বিশ্বস্ত অনলাইন হাট"
          />
        </div>
        <div className="fld">
          <label>Main product name (title)</label>
          <input
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            placeholder="e.g. Sweat Slim Belt Plus (Original Imported)"
          />
        </div>
      </div>

      {/* ── 2. Checkout form configuration (top of page) ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <h3 style={{ margin: 0 }}>2. Checkout form configuration (shown at the top of the page)</h3>
          <span style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 999, fontWeight: 700 }}>
            Khaleshaat Top Checkout
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          Edit the title, offer header and button text of the main checkout form at the top of the landing page here.
        </p>

        <div className="two-col">
          <div className="fld">
            <label>Checkout badge text</label>
            <input
              value={p.content.checkoutBadge}
              onChange={(e) => setContent({ checkoutBadge: e.target.value })}
              placeholder="e.g. ⚡ দ্রুততম চেকআউট"
            />
          </div>
          <div className="fld">
            <label>Order button text</label>
            <input
              value={p.content.buttonText}
              onChange={(e) => setContent({ buttonText: e.target.value })}
              placeholder="e.g. অর্ডার কনফার্ম করুন"
            />
          </div>
        </div>

        <div className="fld">
          <label>Checkout main heading (form header)</label>
          <input
            value={p.content.checkoutTitle}
            onChange={(e) => setContent({ checkoutTitle: e.target.value })}
            placeholder="e.g. অর্ডার কনফার্ম করতে নিচের ফর্মটি পূরণ করুন"
          />
        </div>

        <div className="fld">
          <label>Checkout sub-heading (desktop)</label>
          <input
            value={p.content.checkoutSubtitle}
            onChange={(e) => setContent({ checkoutSubtitle: e.target.value })}
            placeholder="e.g. সঠিক তথ্য দিয়ে ফর্মটি পূরণ করুন, দ্রুততম সময়ে আপনার ঠিকানায় পণ্য পৌঁছে দেওয়া হবে।"
          />
        </div>

        <div className="fld">
          <label>Offer / package selection title</label>
          <input
            value={p.content.offersTitle}
            onChange={(e) => setContent({ offersTitle: e.target.value })}
            placeholder="e.g. আপনার পছন্দের প্রোডাক্ট সিলেক্ট করুন"
          />
        </div>

        <div className="fld">
          <label>Size-chart banner image (optional)</label>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: '0.84rem' }}>
            Shown right below the checkout form as a size reference for customers.
          </p>
          <ImageUploader value={p.content.sizeChartImage} onChange={(url) => setContent({ sizeChartImage: url })} />
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginTop: 14 }}>
          <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: 6 }}>Other checkout-form settings:</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <Link to="/offers" style={{ fontWeight: 600, color: '#e63946' }}>Edit offers &amp; package pricing →</Link>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <Link to="/form-builder" style={{ fontWeight: 600, color: '#e63946' }}>Edit form fields (size, colour, etc.) →</Link>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <Link to="/delivery" style={{ fontWeight: 600, color: '#e63946' }}>Set delivery charges →</Link>
          </div>
        </div>
      </div>

      {/* ── 3. Product hero showcase & slider ── */}
      <div className="card">
        <h3>3. Product hero showcase &amp; gallery slider</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          The large product showcase below the checkout form: slider images, highlights and badges.
        </p>

        <div className="fld">
          <label>Gallery images (slider)</label>
          <ImageGrid images={p.images || []} onAdd={(f) => addImage('gallery', f)} onRemove={(i) => removeImage('gallery', i)} />
        </div>

        <div className="two-col">
          <div className="fld">
            <label>Badge 1 above the slider (red)</label>
            <input
              value={p.content.heroBadge1}
              onChange={(e) => setContent({ heroBadge1: e.target.value })}
              placeholder="e.g. 🔥 ধামাকা অফার"
            />
          </div>
          <div className="fld">
            <label>Badge 2 above the slider (golden)</label>
            <input
              value={p.content.heroBadge2}
              onChange={(e) => setContent({ heroBadge2: e.target.value })}
              placeholder="e.g. ⭐ ১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি"
            />
          </div>
        </div>

        <div className="fld">
          <label>Trending collection badge (above the title)</label>
          <input
            value={p.content.trendingBadge}
            onChange={(e) => setContent({ trendingBadge: e.target.value })}
            placeholder="e.g. 🔥 হট ট্রেন্ডিং কালেকশন ২০২৬"
          />
        </div>

        <div className="fld">
          <label>Bold sub-headline (below the product title)</label>
          <input
            value={p.content.subheadline}
            onChange={(e) => setContent({ subheadline: e.target.value })}
            placeholder="e.g. নারী-পুরুষ উভয়ই ব্যবহার করতে পারবেন"
          />
        </div>

        <div className="fld">
          <label>Quote or sub-text (below the price box)</label>
          <input
            value={p.content.heroSubtext}
            onChange={(e) => setContent({ heroSubtext: e.target.value })}
            placeholder="e.g. ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ"
          />
        </div>

        <div className="fld">
          <label>Large highlight headline (above the call-to-action buttons)</label>
          <input
            value={p.content.heroHighlight}
            onChange={(e) => setContent({ heroHighlight: e.target.value })}
            placeholder="e.g. ইনস্ট্যান্ট স্লিম লুক, নিয়মিত ব্যবহারেই কমবে পেটের মেদ"
          />
        </div>
      </div>

      {/* ── 4. Product video section ── */}
      <div className="card">
        <h3>4. Product video section (optional)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
          Add a YouTube video or Shorts link. Customers see a product demo video on the live page (leave blank to hide the video section).
        </p>
        <div className="fld">
          <label>YouTube video / Shorts link</label>
          <input
            value={p.content.videoUrl}
            onChange={(e) => setContent({ videoUrl: e.target.value })}
            placeholder="e.g. https://www.youtube.com/watch?v=... or https://youtube.com/shorts/..."
          />
        </div>
      </div>

      {/* ── 5. Benefits section ── */}
      <div className="card">
        <h3>5. Benefits section (why buy)</h3>
        <div className="fld">
          <label>Section title</label>
          <input
            value={p.content.benefitTitle}
            onChange={(e) => setContent({ benefitTitle: e.target.value })}
            placeholder="e.g. কেন কিনবেন?"
          />
        </div>
        <div className="fld">
          <label>Benefit details (HTML supported — e.g. &lt;ul&gt;&lt;li&gt;…&lt;/li&gt;&lt;/ul&gt;)</label>
          <textarea
            rows={5}
            value={p.description}
            onChange={(e) => setP({ ...p, description: e.target.value })}
            placeholder="<ul><li>১০০% অরিজিনাল চায়না থেকে ইমপোর্ট</li><li>নিয়মিত ব্যবহারে পেটের মেদ কমাতে সহায়তা করে</li></ul>"
          />
        </div>
      </div>

      {/* ── 6. Usage instructions section ── */}
      <div className="card">
        <h3>6. Usage instructions section (optional)</h3>
        <div className="fld">
          <label>Section title</label>
          <input
            value={p.content.usageTitle}
            onChange={(e) => setContent({ usageTitle: e.target.value })}
            placeholder="e.g. কতক্ষণ ব্যবহার করবেন"
          />
        </div>
        <div className="fld">
          <label>Usage instructions (HTML — leave blank to hide the section)</label>
          <textarea
            rows={3}
            value={p.content.usageHtml}
            onChange={(e) => setContent({ usageHtml: e.target.value })}
            placeholder="<ul><li>প্রতিদিন ৪–৮ ঘণ্টা ব্যবহার করা ভালো।</li><li>হাঁটা, বসা, অফিস কাজ—সবকিছুতেই পরা যায়।</li></ul>"
          />
        </div>
      </div>

      {/* ── 7. Black info bar ── */}
      <div className="card">
        <h3>7. Black info bar (optional)</h3>
        <div className="fld">
          <label>Info text (e.g. size / colour info — leave blank to hide)</label>
          <input
            value={p.content.infoBar}
            onChange={(e) => setContent({ infoBar: e.target.value })}
            placeholder="e.g. ২৮ থেকে ৪৮ সাইজের (BLACK, SKIN) মোট ২টি কালার পাচ্ছেন"
          />
        </div>
      </div>

      {/* ── 8. Customer reviews section ── */}
      <div className="card">
        <h3>8. Customer reviews section</h3>
        <div className="fld">
          <label>Section title</label>
          <input
            value={p.content.reviewsTitle}
            onChange={(e) => setContent({ reviewsTitle: e.target.value })}
            placeholder="e.g. সম্মানিত গ্রাহকদের মতামত"
          />
        </div>
        <label>Review screenshots &amp; images</label>
        <ImageGrid
          images={p.content.reviewImages || []}
          onAdd={(f) => addImage('review', f)}
          onRemove={(i) => removeImage('review', i)}
        />
      </div>

      {/* ── Save & publish bar ── */}
      <div className="save-bar sticky-save">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Publishing…' : 'Publish / save'}
        </button>
        {msg && <Notice type="ok">{msg}</Notice>}
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
          <button className="img-remove" onClick={() => onRemove(i)}><Icon name="x" size={14} /></button>
        </div>
      ))}
      <label className="img-add">
        <Icon name="plus" size={16} /> Image
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

// ── AI landing-copy generator ───────────────────────────────
function AiModal({ initialName, onClose, onApply }) {
  const [form, setForm] = useState({ productName: initialName || '', notes: '', language: 'bn' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [offers, setOffers] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function generate() {
    if (!form.productName.trim()) { setErr('Enter a product name.'); return; }
    setBusy(true); setErr(''); setOffers(null);
    try {
      const r = await api('/ai/landing', { method: 'POST', body: form });
      setOffers(r.offers || []);
      onApply(r); // fills the editor; modal shows offer suggestions then closes via parent
    } catch (e) {
      setErr(e.message || 'Generation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>✨ Generate landing copy with AI</h3><button className="btn-ghost" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
          Give the product name and a few details. AI drafts the headline, benefits, badges and checkout copy — you review and Publish. Prices are placeholders.
        </p>
        <div className="fld"><label>Product name</label><input value={form.productName} onChange={set('productName')} placeholder="e.g. Magnetic Posture Corrector Belt" autoFocus /></div>
        <div className="fld"><label>Details / selling points <span className="muted">(optional)</span></label>
          <textarea rows={4} value={form.notes} onChange={set('notes')} placeholder="Key features, target customer, offer idea, tone…" />
        </div>
        <div className="fld"><label>Language</label>
          <select value={form.language} onChange={set('language')}><option value="bn">বাংলা (Bangla)</option><option value="en">English</option></select>
        </div>
        {err && <p className="err">{err}</p>}
        {offers && offers.length > 0 && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
            <strong style={{ fontSize: '.85rem' }}>Suggested offers</strong> <span className="muted" style={{ fontSize: '.8rem' }}>(add these in the Offers page)</span>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.86rem' }}>
              {offers.map((o, i) => <li key={i}>{o.title} — {o.quantity} pc · ৳{o.price}</li>)}
            </ul>
          </div>
        )}
        <div className="save-bar"><button className="btn-primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : '✨ Generate'}</button></div>
      </div>
    </div>
  );
}
