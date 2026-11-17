export const fmtNumber = (n) => Number(n || 0).toLocaleString('en-KE');

export const fmtMoney = (n, prefix = 'KES') =>
  `${prefix} ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// All times are shown in East Africa Time, whatever time zone the viewer's computer uses.
export const TIME_ZONE = 'Africa/Nairobi';

function toDate(value) {
  // A date-time with no offset (e.g. from a datetime-local input) is already EAT wall-clock time.
  const s = String(value);
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s}+03:00` : s);
}

export function fmtDateTime(value) {
  if (!value) return '';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return value;
  const text = d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: TIME_ZONE,
  });
  return `${text} EAT`;
}

export function fmtRelative(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { timeZone: TIME_ZONE });
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || 'U').substring(0, 2).toUpperCase();
}

/** "duplicate_resolved" → "Duplicate Resolved" (log action codes shown as readable, wrappable labels). */
export function actionLabel(action) {
  return String(action || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ROLE_LABELS = {
  compliance_admin: 'Compliance Admin',
  compliance_officer: 'Compliance Officer',
  both: 'Both (Admin & Officer)',
};
