import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, LogIn, ShieldHalf, User, UserCheck } from 'lucide-react';
import AuthCard, { Alert, Field, RoleTabs } from '../components/AuthCard';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { takeLoginNotice } from '../lib/api';

const ROLE_OPTIONS = [
  { value: 'compliance_officer', label: 'Compliance Officer', icon: UserCheck },
  { value: 'compliance_admin', label: 'Compliance Admin', icon: ShieldHalf },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('compliance_officer');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => takeLoginNotice() || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(username.trim(), password, role);
      navigate(user.role === 'compliance_admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Portal Sign In" subtitle="Access your UFAA compliance account">
      {error && <Alert>{error}</Alert>}
      <RoleTabs value={role} onChange={setRole} options={ROLE_OPTIONS} />
      <form onSubmit={submit}>
        <Field label="Username or Email" icon={User} value={username} onChange={setUsername}
          placeholder="e.g. jwanjiku or officer@airtel.com" autoComplete="username" required />
        <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword}
          placeholder="Enter your password" autoComplete="current-password" required />
        <div className="mb-5 flex justify-end text-sm">
          <button type="button" className="font-bold text-airtel hover:underline"
            onClick={() => setError('For password resets, please contact your Compliance Administrator.')}>
            Forgot password?
          </button>
        </div>
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={busy}>
          {busy ? <Spinner /> : <LogIn className="h-5 w-5" />} Sign In to Portal
        </button>
      </form>
      <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
        Don&apos;t have an account? <Link to="/register" className="font-bold text-airtel hover:underline">Register Here</Link>
      </div>
    </AuthCard>
  );
}
