import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFunnel } from '../funnel.jsx';
import { Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

// Each funnel is a product sold at /funnel-step/<slug>/. This page lists them
// and creates / clones / renames / deletes funnels. Selecting one makes it the
// active funnel for Offers, Checkout form, Delivery, Landing page, Tracking and
// Store info across the panel.
export default function Funnels() {
  const { funnels, funnelId, setFunnelId, reload, loading } = useFunnel();
  const [editing, setEditing] = useState(null); // { mode:'new'|'clone'|'edit', funnel }
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  async function selectAndEdit(id) {
    setFunnelId(id);
    navigate('/offers');
  }

  async function remove(f) {
    if (!confirm(`Delete funnel "${f.name}"? Its offers, form fields and delivery zones are removed too. This cannot be undone.`)) return;
    try {
      await api('/funnels/' + f._id, { method: 'DELETE' });
      setMsg('');
      await reload();
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function toggleActive(f) {
    try {
      await api('/funnels/' + f._id, { method: 'PUT', body: { active: !f.active } });
      await reload();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Funnels</h1>
        <button className="btn-primary" onClick={() => setEditing({ mode: 'new', funnel: { name: '', slug: '' } })}>
          <Icon name="plus" size={16} /> New funnel
        </button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Each funnel is a separate product page at <code>/funnel-step/&lt;slug&gt;/</code> with its own offers, checkout
        form, delivery zones, landing content and tracking. SMS, courier, admin users and the duplicate guard are shared.
      </p>
      <Notice type="err">{msg}</Notice>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="offer-cards" style={{ marginTop: 14 }}>
          {funnels.map((f) => {
            const selected = String(f._id) === String(funnelId);
            return (
              <div className={'card offer-admin' + (selected ? ' is-selected' : '')} key={f._id}>
                {f.images?.[0] && <img src={f.images[0]} alt="" className="offer-thumb" />}
                <div className="offer-admin-body">
                  <div className="offer-admin-head">
                    <b>{f.name || '(untitled)'}</b>
                    {f.isDefault && <span className="badge-default">Default</span>}
                    {selected && <span className="badge-default" style={{ background: '#0ea5e9' }}>Editing</span>}
                    {!f.active && <span className="badge-off">Off</span>}
                  </div>
                  <div className="offer-admin-price">
                    <a href={`/funnel-step/${f.slug}/`} target="_blank" rel="noreferrer">/funnel-step/{f.slug}/</a>
                    {' · '}{f.offerCount} offer{f.offerCount === 1 ? '' : 's'}
                    {' · '}{f.orderCount} order{f.orderCount === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="fr-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {!selected && (
                    <button className="btn-primary sm" onClick={() => selectAndEdit(f._id)}>
                      <Icon name="edit" size={14} /> Select &amp; edit
                    </button>
                  )}
                  {selected && <span className="ok-text sm" style={{ alignSelf: 'center' }}>Now editing</span>}
                  <button className="btn-ghost sm" onClick={() => setEditing({ mode: 'edit', funnel: { ...f } })} title="Rename / slug">
                    <Icon name="settings" size={14} /> Edit
                  </button>
                  <button className="btn-ghost sm" onClick={() => setEditing({ mode: 'clone', funnel: { name: `${f.name} (copy)`, slug: '', _src: f._id } })} title="Duplicate">
                    <Icon name="copy" size={14} /> Clone
                  </button>
                  <button className="btn-ghost sm" onClick={() => toggleActive(f)} title={f.active ? 'Deactivate' : 'Activate'}>
                    <Icon name={f.active ? 'eye-off' : 'eye'} size={14} /> {f.active ? 'Off' : 'On'}
                  </button>
                  {!f.isDefault && (
                    <button className="btn-ghost sm danger" onClick={() => remove(f)} title="Delete">
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <FunnelModal
          state={editing}
          onClose={() => setEditing(null)}
          onSaved={async (newId) => {
            setEditing(null);
            await reload();
            if (newId) setFunnelId(newId);
          }}
        />
      )}
    </div>
  );
}

function FunnelModal({ state, onClose, onSaved }) {
  const { mode, funnel } = state;
  const [f, setF] = useState({ ...funnel });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const title = mode === 'new' ? 'New funnel' : mode === 'clone' ? 'Clone funnel' : 'Edit funnel';

  async function save() {
    if (!f.name?.trim()) { setErr('Enter a funnel name.'); return; }
    setBusy(true); setErr('');
    try {
      let res;
      const body = { name: f.name.trim(), slug: (f.slug || '').trim(), active: f.active !== false };
      if (mode === 'new') res = await api('/funnels', { method: 'POST', body });
      else if (mode === 'clone') res = await api('/funnels/' + funnel._src + '/clone', { method: 'POST', body });
      else res = await api('/funnels/' + f._id, { method: 'PUT', body });
      onSaved(mode === 'edit' ? null : res?.funnel?._id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="btn-ghost" onClick={onClose}><Icon name="x" size={16} /></button></div>

        {mode === 'new' && (
          <p className="muted">A new funnel is seeded with a copy of the default funnel's checkout form and delivery zones, plus one blank offer — so it works right away. Edit its offers and landing page after.</p>
        )}
        {mode === 'clone' && (
          <p className="muted">Clones this funnel's landing content, offers, checkout form and delivery zones into a new funnel you can edit independently.</p>
        )}

        <div className="fld"><label>Funnel name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Magnetic Posture Belt" autoFocus /></div>
        <div className="fld">
          <label>URL slug <span className="muted">(optional — auto from name; letters, numbers, hyphens)</span></label>
          <input value={f.slug || ''} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="e.g. posture-belt" />
          {f.slug && <small className="muted">/funnel-step/{f.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}/</small>}
        </div>
        {mode === 'edit' && (
          <label className="cbx"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (served to customers)</label>
        )}

        {err && <p className="err">{err}</p>}
        <div className="save-bar"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}
