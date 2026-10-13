import { useEffect, useState, useCallback } from 'react';
import { useFunnelApi } from '../funnel.jsx';
import { money } from '../constants.js';
import { Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import ImageUploader from '../components/ImageUploader.jsx';

const blankOffer = { title: '', price: '', comparePrice: '', quantity: 1, badge: '', image: '', isDefault: false, active: true };

export default function Offers() {
  const fapi = useFunnelApi();
  const [offers, setOffers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await fapi('/offers');
    setOffers(d.offers);
  }, [fapi]);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!confirm('Delete this offer?')) return;
    try { await fapi('/offers/' + id, { method: 'DELETE' }); load(); }
    catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Products &amp; offers</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...blankOffer })}><Icon name="plus" size={16} /> New offer</button>
      </div>
      <Notice type="err">{msg}</Notice>

      <div className="offer-cards">
        {offers.map((o) => (
          <div className="card offer-admin" key={o._id}>
            {o.image && <img src={o.image} alt="" className="offer-thumb" />}
            <div className="offer-admin-body">
              <div className="offer-admin-head">
                <b>{o.title}</b>
                {o.isDefault && <span className="badge-default">Default</span>}
                {!o.active && <span className="badge-off">Off</span>}
              </div>
              <div className="offer-admin-price">{money(o.price)} {o.comparePrice ? <s>{money(o.comparePrice)}</s> : null} · {o.quantity} pcs {o.badge && <>· <span className="ok-text">{o.badge}</span></>}</div>
            </div>
            <div className="fr-actions">
              <button className="btn-ghost sm" onClick={() => setEditing(o)}><Icon name="edit" size={15} /> Edit</button>
              <button className="btn-ghost sm danger" onClick={() => remove(o._id)} title="Delete"><Icon name="trash" size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <OfferModal offer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function OfferModal({ offer, onClose, onSaved }) {
  const fapi = useFunnelApi();
  const isNew = !offer._id;
  const [o, setO] = useState({ ...offer });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    const body = {
      title: o.title, price: Number(o.price) || 0,
      comparePrice: o.comparePrice === '' || o.comparePrice == null ? null : Number(o.comparePrice),
      quantity: Number(o.quantity) || 1, badge: o.badge, image: o.image, sku: o.sku || '',
      isDefault: !!o.isDefault, active: o.active !== false,
    };
    try {
      if (isNew) await fapi('/offers', { method: 'POST', body });
      else await fapi('/offers/' + o._id, { method: 'PUT', body });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{isNew ? 'New offer' : 'Edit offer'}</h3><button className="btn-ghost" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="fld"><label>Title</label><input value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} placeholder="e.g. 2 pieces" /></div>
        <div className="two-col">
          <div className="fld"><label>Price (৳)</label><input type="number" value={o.price} onChange={(e) => setO({ ...o, price: e.target.value })} /></div>
          <div className="fld"><label>Compare-at price (optional)</label><input type="number" value={o.comparePrice ?? ''} onChange={(e) => setO({ ...o, comparePrice: e.target.value })} /></div>
        </div>
        <div className="two-col">
          <div className="fld"><label>Piece count</label><input type="number" value={o.quantity} onChange={(e) => setO({ ...o, quantity: e.target.value })} /></div>
          <div className="fld"><label>Badge text</label><input value={o.badge || ''} onChange={(e) => setO({ ...o, badge: e.target.value })} placeholder="e.g. Save more!" /></div>
        </div>
        <div className="fld"><label>Product code / SKU <span className="muted">(sent to the CRM; optional)</span></label><input value={o.sku || ''} onChange={(e) => setO({ ...o, sku: e.target.value })} placeholder="e.g. BELT-2PC" /></div>
        <div className="fld"><label>Offer image (optional)</label><ImageUploader value={o.image} onChange={(url) => setO({ ...o, image: url })} /></div>
        <label className="cbx"><input type="checkbox" checked={!!o.isDefault} onChange={(e) => setO({ ...o, isDefault: e.target.checked })} /> Selected by default</label>
        <label className="cbx" style={{ marginTop: 6 }}><input type="checkbox" checked={o.active !== false} onChange={(e) => setO({ ...o, active: e.target.checked })} /> Active</label>
        {err && <p className="err">{err}</p>}
        <div className="save-bar"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}
