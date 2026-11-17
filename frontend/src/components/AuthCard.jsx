import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function AuthCard({ title, subtitle, children, wide = false }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-navy-dark via-navy to-navy-dark px-4 py-6 dark:from-black dark:via-navy-dark dark:to-black">
      <div className={`m-auto w-full overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-xl'}`}>
        <header className="flex flex-col items-center justify-between gap-3 bg-gradient-to-br from-airtel to-airtel-dark px-7 py-4 text-white sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/45 bg-white/20 text-2xl font-black">U</div>
            <div>
              <h1 className="text-xl font-extrabold">UFAA Portal</h1>
              <p className="text-[0.68rem] uppercase tracking-wider text-white/85">Unclaimed Financial Assets Authority</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 sm:items-end">
            <div className="rounded-lg bg-white px-2.5 py-1 shadow">
              <img src="/logo.png" alt="Airtel logo" className="h-7 w-auto" />
            </div>
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-white/85">Airtel Internal Compliance Portal</span>
          </div>
        </header>
        <div className="px-6 py-6 sm:px-8">
          <div className="mb-5 border-b border-slate-100 pb-3 text-center">
            <h2 className="text-2xl font-extrabold text-heading">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
          <div className="mt-3 flex justify-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoleTabs({ value, onChange, options }) {
  return (
    <div className="mb-5 grid grid-cols-1 gap-2 rounded-xl bg-slate-100 p-1.5 sm:grid-cols-2">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
            value === v ? 'bg-surface text-airtel shadow' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, icon: Icon, type = 'text', value, onChange, ...rest }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-bold text-heading">{label}</label>
      <div className="relative flex items-center">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />}
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input py-2.5 pl-10 pr-10 text-base sm:text-sm"
          {...rest}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 p-1 text-slate-400 hover:text-slate-600">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function Alert({ tone = 'error', children }) {
  const cls = tone === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800';
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${cls}`}>{children}</div>;
}
