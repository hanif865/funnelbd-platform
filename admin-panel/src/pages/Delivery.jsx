import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function Delivery() {
  const [zones, setZones] = useState([]);
  const [free, setFree] = useState({ enabled: false, threshold: 0, allFree: false });
  const [adding, setAdding] = useState({ name: '', charge: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [z, s] = await Promise.all([api('/zones'), api('/settings')]);
    setZones(z.zones);
    setFree(s.freeDelivery || { enabled: false, threshold: 0, allFree: false });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addZone() {
    if (!adding.name.trim()) return;
    await api('/zones', { method: 'POST', body: { name: adding.name, charge: Number(adding.charge) || 0 } });
    setAdding({ name: '', charge: '' });
    load();
  }
  async function updateZone(id, patch) { await api('/zones/' + id, { method: 'PUT', body: patch }); load(); }
  async function deleteZone(id) {
    try { await api('/zones/' + id, { method: 'DELETE' }); load(); }
    catch (e) { setMsg(e.message); }
  }
  async function saveFree() {
    await api('/settings', { method: 'PUT', body: { freeDelivery: free } });
    setMsg('ফ্রি ডেলিভারি সেটিংস সেভ হয়েছে।');
  }

  return (
    <div>
      <div className="page-head"><h1>ডেলিভারি</h1></div>
      {msg && <p className="ok-text">{msg}</p>}

      <div className="card">
        <h3>ডেলিভারি জোন</h3>
        {zones.map((z) => (
          <div className="zone-edit" key={z._id}>
            <input value={z.name} onChange={(e) => setZones(zones.map((x) => x._id === z._id ? { ...x, name: e.target.value } : x))} onBlur={() => updateZone(z._id, { name: z.name })} />
            <input type="number" value={z.charge} onChange={(e) => setZones(zones.map((x) => x._id === z._id ? { ...x, charge: e.target.value } : x))} onBlur={() => updateZone(z._id, { charge: Number(z.charge) || 0 })} />
            <label className="cbx"><input type="checkbox" checked={z.isDefault} onChange={() => updateZone(z._id, { isDefault: true })} /> ডিফল্ট</label>
            <button className="btn-ghost sm danger" onClick={() => deleteZone(z._id)}>✕</button>
          </div>
        ))}
        <div className="zone-edit add">
          <input placeholder="নতুন জোনের নাম" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          <input type="number" placeholder="চার্জ" value={adding.charge} onChange={(e) => setAdding({ ...adding, charge: e.target.value })} />
          <button className="btn-primary" onClick={addZone}>যোগ</button>
        </div>
      </div>

      <div className="card">
        <h3>ফ্রি ডেলিভারি</h3>
        <label className="cbx"><input type="checkbox" checked={free.allFree} onChange={(e) => setFree({ ...free, allFree: e.target.checked })} /> সব অর্ডারে ফ্রি ডেলিভারি</label>
        <label className="cbx" style={{ marginTop: 8 }}><input type="checkbox" checked={free.enabled} onChange={(e) => setFree({ ...free, enabled: e.target.checked })} /> নির্দিষ্ট টাকার উপরে ফ্রি</label>
        {free.enabled && !free.allFree && (
          <div className="fld" style={{ marginTop: 8 }}><label>ন্যূনতম অর্ডার (৳)</label>
            <input type="number" value={free.threshold} onChange={(e) => setFree({ ...free, threshold: Number(e.target.value) || 0 })} />
          </div>
        )}
        <div className="save-bar"><button className="btn-primary" onClick={saveFree}>সেভ</button></div>
      </div>
    </div>
  );
}
