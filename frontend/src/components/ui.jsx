import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Modal({ open, onClose, title, icon, children, footer, wide = false, locked = false }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => !locked && e.target === e.currentTarget && onClose?.()}
    >
      <div className={`flex max-h-[88vh] w-full flex-col rounded-2xl border border-slate-200 bg-surface shadow-[0_15px_35px_rgba(0,0,0,0.15)] ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
        {title && (
          <div className="mx-6 flex items-center justify-between border-b border-slate-100 pb-3 pt-5">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              {icon}
              {title}
            </h3>
            {!locked && (
              <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-5">{footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="page-title flex items-center gap-2 text-[1.55rem] font-extrabold leading-tight tracking-[-0.5px] text-slate-900">
          {Icon && <Icon className="h-6 w-6 text-airtel" />}
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[0.87rem] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// Icon tints follow the PHP .stat-icon classes: a faint fill plus a matching border.
const ICON_TONES = {
  slate: 'border-slate-200 bg-slate-100 text-slate-700',
  gold: 'border-orange-600/25 bg-orange-600/[0.08] text-orange-600',
  green: 'border-green-600/25 bg-green-600/[0.08] text-green-600',
  sky: 'border-blue-600/25 bg-blue-600/[0.08] text-blue-600',
  violet: 'border-violet-600/25 bg-violet-600/[0.08] text-violet-600',
  red: 'border-red-600/25 bg-red-600/[0.08] text-airtel',
};
const VALUE_TONES = { sky: 'text-sky-500' };

/** Split "KES 1,234.00" into the currency and the number. */
export function splitCurrency(value) {
  const text = String(value ?? '');
  const m = text.match(/^(KES|KSh)\s+(.+)$/);
  return m ? { currency: m[1], number: m[2] } : { currency: '', number: text };
}

/** Longest number (ignoring the currency) in a set of values — pass it as `fitChars` to give a row of cards one shared size. */
export const fitCharsFor = (values) => Math.max(1, ...values.map((v) => splitCurrency(v).number.length));

/**
 * A number that always fits its box on one line. The currency ("KES"/"KSh") sits on its own small
 * line above it. The font shrinks with the box width (container query units) and the text length,
 * capped at `max`. Cards given the same `fitChars` (and the same width) render at the same size.
 */
export function FitValue({ value, max = '1.75rem', fitChars, reserveCurrency = false, className = '' }) {
  const { currency, number } = splitCurrency(value);
  const chars = Math.max(fitChars || 0, number.length, 1);
  return (
    <div className="w-full min-w-0 [container-type:inline-size]" title={String(value ?? '')}>
      {(currency || reserveCurrency) && (
        <div className="text-[0.72rem] font-bold uppercase tracking-[0.8px] text-slate-500">{currency || ' '}</div>
      )}
      <div
        className={`whitespace-nowrap font-extrabold leading-tight tracking-[-0.01em] ${className}`}
        style={{ fontSize: `min(${max}, ${(160 / chars).toFixed(2)}cqi)` }}
      >
        {number}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'slate', fitChars }) {
  return (
    <div className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-l-4 border-slate-200 border-l-airtel bg-surface p-5 shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-[3px] hover:border-l-airtel-dark hover:shadow-[0_12px_28px_rgba(204,0,0,0.1)]">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-airtel to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <h3 className="pt-1 text-[0.78rem] font-medium uppercase leading-snug tracking-[0.8px] text-slate-500">{label}</h3>
        {Icon && (
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${ICON_TONES[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <FitValue value={value} fitChars={fitChars} reserveCurrency={!!fitChars} className={VALUE_TONES[tone] || 'text-slate-900'} />
      {sub && <div className="-mt-1 text-xs font-bold text-slate-500">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center text-slate-500">
      {Icon && <Icon className="h-12 w-12 text-slate-300" />}
      <div>{children}</div>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onChange, unit = 'records' }) {
  if (totalPages <= 1) {
    return total !== undefined ? (
      <div className="pt-5 text-[0.85rem] text-slate-500">
        <b className="font-semibold text-slate-900">{Number(total).toLocaleString()}</b> {unit}
      </div>
    ) : null;
  }
  const pages = Array.from({ length: Math.min(totalPages, 5000) }, (_, i) => i + 1);
  const nav = 'flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-surface px-3.5 text-[0.85rem] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30';
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
      <div className="text-[0.85rem] text-slate-500">
        Showing Page <b className="font-semibold text-slate-900">{page}</b> of <b className="font-semibold text-slate-900">{totalPages}</b>
        {total !== undefined && <> (<b className="font-semibold text-slate-900">{Number(total).toLocaleString()}</b> {unit})</>}
      </div>
      <div className="flex items-center gap-1.5">
        <button className={nav} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <select className="input h-9 w-auto py-0" value={page} onChange={(e) => onChange(Number(e.target.value))} aria-label="Jump to page">
          {pages.map((p) => (
            <option key={p} value={p}>Page {p}</option>
          ))}
        </select>
        <button className={nav} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ProgressModal({ open, title, message, percent, detail, tone = 'red' }) {
  if (!open) return null;
  const bar = tone === 'green' ? 'from-green-600 to-green-400' : 'from-airtel to-[#ff6666]';
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-8 text-center shadow-2xl">
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 ${tone === 'green' ? 'border-green-600 bg-green-50 text-green-600' : 'border-airtel bg-red-50 text-airtel'}`}>
          <Spinner className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900">{title}</h3>
        {message && <p className="mt-2 whitespace-pre-line break-words text-sm font-semibold text-slate-600">{message}</p>}
        {percent !== undefined && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <div className={`h-full rounded-full bg-gradient-to-r ${bar} transition-all`} style={{ width: `${percent}%` }} />
          </div>
        )}
        {detail && <div className="mt-3 text-xs text-slate-500">{detail}</div>}
      </div>
    </div>
  );
}
