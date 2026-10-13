import { useEffect, useState, useCallback } from 'react';
import { useFunnelApi } from '../funnel.jsx';
import { Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const TYPES = [
  { v: 'text', l: 'Text' }, { v: 'number', l: 'Number' }, { v: 'textarea', l: 'Long text' },
  { v: 'radio', l: 'Radio' }, { v: 'select', l: 'Dropdown' }, { v: 'checkbox', l: 'Checkbox' },
];
const blank = { label: '', name: '', type: 'text', options: [], placeholder: '', required: false, active: true };

export default function FormBuilder() {
  const fapi = useFunnelApi();
  const [fields, setFields] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await fapi('/fields');
    setFields(d.fields);
  }, [fapi]);
  useEffect(() => { load(); }, [load]);

  async function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
    await fapi('/fields/reorder', { method: 'PUT', body: { ids: next.map((f) => f._id) } });
  }

  async function toggleActive(f) {
    if (f.isCore) return;
    await fapi('/fields/' + f._id, { method: 'PUT', body: { active: !f.active } });
    load();
  }

  async function remove(f) {
    if (f.isCore) return;
    if (!confirm(`Delete the "${f.label}" field?`)) return;
    try { await fapi('/fields/' + f._id, { method: 'DELETE' }); load(); }
    catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Form builder</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Icon name="plus" size={16} /> New field</button>
      </div>
      <Notice type="err">{msg}</Notice>

      <div className="builder-grid">
        <div className="card">
          <h3>Fields</h3>
          <p className="muted" style={{ marginTop: 0 }}>Core fields (name / phone / address) are locked — only the label can be changed.</p>
          {fields.map((f, i) => (
            <div className={'field-row' + (f.active ? '' : ' inactive')} key={f._id}>
              <div className="fr-move">
                <button className="btn-ghost sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><Icon name="up" size={14} /></button>
                <button className="btn-ghost sm" disabled={i === fields.length - 1} onClick={() => move(i, 1)} title="Move down"><Icon name="down" size={14} /></button>
              </div>
              <div className="fr-main">
                <b>{f.label}</b> {f.isCore && <span className="lock">Core</span>}
                <div className="muted">{f.name} · {TYPES.find((t) => t.v === f.type)?.l}{f.required ? ' · required' : ''}</div>
              </div>
              <div className="fr-actions">
                {!f.isCore && (
                  <label className="mini-switch" title="On / off">
                    <input type="checkbox" checked={f.active} onChange={() => toggleActive(f)} />
                  </label>
                )}
                <button className="btn-ghost sm" onClick={() => setEditing(f)}><Icon name="edit" size={15} /> Edit</button>
                {!f.isCore && <button className="btn-ghost sm danger" onClick={() => remove(f)} title="Delete"><Icon name="trash" size={15} /></button>}
              </div>
            </div>
          ))}
        </div>

        {/* Live preview */}
        <div className="card preview">
          <h3>Live preview</h3>
          {fields.filter((f) => f.active).map((f) => (
            <div className="fld" key={f._id}>
              <label>{f.label}{f.required && <span style={{ color: '#e63946' }}> *</span>}</label>
              {f.type === 'textarea' ? <textarea rows={2} placeholder={f.placeholder} disabled /> :
                f.type === 'select' ? <select disabled><option>{f.placeholder || 'Select'}</option></select> :
                f.type === 'radio' ? <div className="radio-preview">{f.options.map((o) => <span key={o} className="rp">{o}</span>)}</div> :
                f.type === 'checkbox' ? <label className="cbx"><input type="checkbox" disabled /> {f.placeholder || f.label}</label> :
                <input placeholder={f.placeholder} disabled />}
            </div>
          ))}
        </div>
      </div>

      {editing && <FieldModal field={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function FieldModal({ field, onClose, onSaved }) {
  const fapi = useFunnelApi();
  const isNew = !field._id;
  const [f, setF] = useState({ ...field, optionsText: (field.options || []).join('\n') });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const hasOptions = f.type === 'radio' || f.type === 'select';

  async function save() {
    setBusy(true); setErr('');
    const body = {
      label: f.label, name: f.name, type: f.type,
      options: hasOptions ? f.optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      placeholder: f.placeholder, required: !!f.required, active: f.active !== false,
    };
    try {
      if (isNew) await fapi('/fields', { method: 'POST', body });
      else await fapi('/fields/' + f._id, { method: 'PUT', body });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{isNew ? 'New field' : (f.isCore ? 'Core field (limited editing)' : 'Edit field')}</h3><button className="btn-ghost" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="fld"><label>Label (what the customer sees)</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        {!f.isCore && (
          <>
            <div className="fld"><label>Field name (English, unique)</label>
              <input value={f.name} disabled={!isNew} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. size" />
            </div>
            <div className="fld"><label>Type</label>
              <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
            </div>
            {hasOptions && <div className="fld"><label>Options (one per line)</label><textarea rows={3} value={f.optionsText} onChange={(e) => setF({ ...f, optionsText: e.target.value })} /></div>}
            <label className="cbx"><input type="checkbox" checked={!!f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Required</label>
          </>
        )}
        <div className="fld"><label>Placeholder</label><input value={f.placeholder || ''} onChange={(e) => setF({ ...f, placeholder: e.target.value })} /></div>
        {err && <p className="err">{err}</p>}
        <div className="save-bar"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}
