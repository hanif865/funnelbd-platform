import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import ImageUploader from '../components/ImageUploader.jsx';

const blankOffer = { title: '', price: '', comparePrice: '', quantity: 1, badge: '', image: '', isDefault: false, active: true };

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await api('/offers');
    setOffers(d.offers);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!confirm('এই অফারটি ডিলিট করবেন?')) return;
    try { await api('/offers/' + id, { method: 'DELETE' }); load(); }
    catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      <div className="page-head">
        <h1>প্রোডাক্ট ও অফার</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...blankOffer })}>+ নতুন অফার</button>
      </div>
      {msg && <p className="err">{msg}</p>}

      <div className="offer-cards">
        {offers.map((o) => (
          <div className="card offer-admin" key={o._id}>
            {o.image && <img src={o.image} alt="" className="offer-thumb" />}
            <div className="offer-admin-body">
              <div className="offer-admin-head">
                <b>{o.title}</b>
                {o.isDefault && <span className="badge-default">ডিফল্ট</span>}
                {!o.active && <span className="badge-off">বন্ধ</span>}
              </div>
              <div className="offer-admin-price">{o.price}৳ {o.comparePrice ? <s>{o.comparePrice}৳</s> : null} · {o.quantity} পিস {o.badge && <>· <span className="ok-text">{o.badge}</span></>}</div>
            </div>
            <div className="fr-actions">
              <button className="btn-ghost sm" onClick={() => setEditing(o)}>এডিট</button>
              <button className="btn-ghost sm danger" onClick={() => remove(o._id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {editing && <OfferModal offer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function OfferModal({ offer, onClose, onSaved }) {
  const isNew = !offer._id;
  const [o, setO] = useState({ ...offer });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    const body = {
      title: o.title, price: Number(o.price) || 0,
      comparePrice: o.comparePrice === '' || o.comparePrice == null ? null : Number(o.comparePrice),
      quantity: Number(o.quantity) || 1, badge: o.badge, image: o.image,
      isDefault: !!o.isDefault, active: o.active !== false,
    };
    try {
      if (isNew) await api('/offers', { method: 'POST', body });
      else await api('/offers/' + o._id, { method: 'PUT', body });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{isNew ? 'নতুন অফার' : 'অফার এডিট'}</h3><button className="btn-ghost" onClick={onClose}>✕</button></div>
        <div className="fld"><label>টাইটেল</label><input value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} placeholder="যেমন: ২ পিস" /></div>
        <div className="two-col">
          <div className="fld"><label>দাম (৳)</label><input type="number" value={o.price} onChange={(e) => setO({ ...o, price: e.target.value })} /></div>
          <div className="fld"><label>কাটা দাম (ঐচ্ছিক)</label><input type="number" value={o.comparePrice ?? ''} onChange={(e) => setO({ ...o, comparePrice: e.target.value })} /></div>
        </div>
        <div className="two-col">
          <div className="fld"><label>পিস সংখ্যা</label><input type="number" value={o.quantity} onChange={(e) => setO({ ...o, quantity: e.target.value })} /></div>
          <div className="fld"><label>ব্যাজ টেক্সট</label><input value={o.badge || ''} onChange={(e) => setO({ ...o, badge: e.target.value })} placeholder="যেমন: সাশ্রয়!" /></div>
        </div>
        <div className="fld"><label>অফার ছবি (ঐচ্ছিক)</label><ImageUploader value={o.image} onChange={(url) => setO({ ...o, image: url })} /></div>
        <label className="cbx"><input type="checkbox" checked={!!o.isDefault} onChange={(e) => setO({ ...o, isDefault: e.target.checked })} /> ডিফল্ট সিলেক্টেড</label>
        <label className="cbx" style={{ marginTop: 6 }}><input type="checkbox" checked={o.active !== false} onChange={(e) => setO({ ...o, active: e.target.checked })} /> চালু</label>
        {err && <p className="err">{err}</p>}
        <div className="save-bar"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'সেভ হচ্ছে…' : 'সেভ'}</button></div>
      </div>
    </div>
  );
}
