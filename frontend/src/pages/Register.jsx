import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, Lock, Mail, ShieldHalf, UserCheck, UserPlus, UserRound } from 'lucide-react';
import AuthCard, { Alert, Field, RoleTabs } from '../components/AuthCard';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';

const ROLE_OPTIONS = [
  { value: 'compliance_officer', label: 'Compliance Officer', icon: UserCheck },
  { value: 'compliance_admin', label: 'Compliance Admin', icon: ShieldHalf },
];

const EMPTY = { fullname: '', username: '', email: '', password: '', confirm_password: '' };

export default function Register() {
  const [form, setForm] = useState(EMPTY);
  const [role, setRole] = useState('compliance_officer');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/auth/register', { method: 'POST', body: { ...form, role, terms } });
      setSuccess(res.message);
      setForm(EMPTY);
      setTerms(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create Account" subtitle="Register for the UFAA compliance portal" wide>
      {error && <Alert>{error}</Alert>}
      {success && (
        <Alert tone="success">
          {success} <Link to="/login" className="underline">Sign in now</Link>
        </Alert>
      )}
      <RoleTabs value={role} onChange={setRole} options={ROLE_OPTIONS} />
      <form onSubmit={submit}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Full Name" icon={UserRound} value={form.fullname} onChange={set('fullname')} placeholder="e.g. Jane Wanjiku" required />
          <Field label="Username" icon={AtSign} value={form.username} onChange={set('username')} placeholder="e.g. jwanjiku" autoComplete="username" required />
        </div>
        <Field label="Work Email" icon={Mail} type="email" value={form.email} onChange={set('email')} placeholder="officer@airtel.com" required />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Password" icon={Lock} type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" autoComplete="new-password" required />
          <Field label="Confirm Password" icon={Lock} type="password" value={form.confirm_password} onChange={set('confirm_password')} placeholder="Re-enter password" autoComplete="new-password" required />
        </div>
        <label className="mb-5 flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-airtel" />
          I agree to the UFAA &amp; Airtel Security Policies and confirm this is my work account.
        </label>
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={busy}>
          {busy ? <Spinner /> : <UserPlus className="h-5 w-5" />} Create Account
        </button>
      </form>
      <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
        Already registered? <Link to="/login" className="font-bold text-airtel hover:underline">Sign In</Link>
      </div>
    </AuthCard>
  );
}
