import { useState, useRef } from 'react';
import { getToken } from '../api.js';
import Icon from './Icon.jsx';

/**
 * Single-image uploader. Posts multipart to /api/admin/upload and returns the
 * stored URL via onChange. Shows a thumbnail preview when a value is set.
 */
export default function ImageUploader({ value, onChange, label = 'Upload image' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const inputRef = useRef();

  async function upload(file) {
    if (!file) return;
    setBusy(true); setErr(''); setInfo('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      onChange(data.url);
      // Server converts every upload to optimized WebP — show the saving.
      if (data.originalBytes && data.bytes) {
        const kb = (b) => Math.round(b / 1024) + 'KB';
        setInfo(`WebP ${data.width}×${data.height} · ${kb(data.originalBytes)} → ${kb(data.bytes)}`);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="uploader">
      {value && <img src={value} alt="" className="upload-thumb" />}
      <div className="upload-actions">
        <button type="button" className="btn-ghost sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Icon name="image" size={15} /> {busy ? 'Uploading…' : value ? 'Replace' : label}
        </button>
        {value && <button type="button" className="btn-ghost sm danger" onClick={() => onChange('')}>Remove</button>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
      {err && <span className="err">{err}</span>}
      {info && <span className="hint">{info}</span>}
    </div>
  );
}
