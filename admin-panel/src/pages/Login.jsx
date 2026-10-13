import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', businessName: '', subdomain: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await signup({
          businessName: form.businessName,
          email: form.email,
          password: form.password,
          subdomain: form.subdomain,
        });
      }
      navigate('/orders', { replace: true });
    } catch (err) {
      setError(err.message || (mode === 'login' ? 'Sign-in failed.' : 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="center-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-brand"><span className="logo-mark">F</span> FunnelBD</h1>
        <p className="login-sub">{isSignup ? 'Create your store account' : 'Sign in to the admin panel'}</p>

        <div className="tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={'tab' + (!isSignup ? ' active' : '')} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
          <button type="button" className={'tab' + (isSignup ? ' active' : '')} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
        </div>

        {isSignup && (
          <>
            <label className="lbl" htmlFor="su-business">Business / store name</label>
            <input id="su-business" value={form.businessName} onChange={set('businessName')} placeholder="e.g. Acme Store" required autoFocus />

            <label className="lbl" htmlFor="su-sub">Subdomain <span className="muted">(optional)</span></label>
            <input id="su-sub" value={form.subdomain} onChange={set('subdomain')} placeholder="acme" />
            {form.subdomain && <small className="muted">{form.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')}.funnelbd.com</small>}
          </>
        )}

        <label className="lbl" htmlFor="login-email">Email</label>
        <input id="login-email" type="email" value={form.email} onChange={set('email')}
          placeholder="you@example.com" autoComplete="username" required autoFocus={!isSignup} />

        <label className="lbl" htmlFor="login-password">Password</label>
        <input id="login-password" type="password" value={form.password} onChange={set('password')}
          placeholder={isSignup ? 'At least 8 characters' : '••••••••'} autoComplete={isSignup ? 'new-password' : 'current-password'} required />

        {error && <p className="err" role="alert">{error}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? (isSignup ? 'Creating…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}
        </button>
      </form>
    </div>
  );
}
