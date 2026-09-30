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
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-brand"><span className="logo-mark">F</span> FunnelBD</h1>
        <p className="login-sub">Sign in to the admin panel</p>

        <label className="lbl" htmlFor="login-email">Email</label>
        <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="username" required autoFocus />

        <label className="lbl" htmlFor="login-password">Password</label>
        <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••" autoComplete="current-password" required />

        {error && <p className="err" role="alert">{error}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
