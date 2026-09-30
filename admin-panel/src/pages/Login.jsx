import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/orders', { replace: true });
    } catch (err) {
      setError(err.message || 'লগইন ব্যর্থ।');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-brand">FunnelBD</h1>
        <p className="login-sub">অ্যাডমিন প্যানেল</p>

        <label className="lbl">ইমেইল</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@funnelbd.local" required autoFocus />

        <label className="lbl">পাসওয়ার্ড</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••" required />

        {error && <p className="err">{error}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'লগইন হচ্ছে…' : 'লগইন'}
        </button>
      </form>
    </div>
  );
}
