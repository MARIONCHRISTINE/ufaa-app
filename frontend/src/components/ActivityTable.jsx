import { ListChecks } from 'lucide-react';
import { actionLabel, fmtDateTime } from '../lib/format';
import { EmptyState, Spinner } from './ui';

const ACTION_TONES = {
  login: 'badge-claimed',
  logout: 'badge-neutral',
  login_failed: 'badge-rose',
  upload: 'badge-blue',
  draft_upload: 'badge-blue',
  export: 'badge-submitted',
  report_export: 'badge-submitted',
  status_change: 'badge-unclaimed',
  password_vault_view: 'badge-rose',
  'Duplicate Flagged': 'badge-unclaimed',
  duplicate_resolved: 'badge-claimed',
  duplicate_confirmed: 'badge-unclaimed',
  duplicate_cleared: 'badge-neutral',
};

function ActionBadge({ action }) {
  return (
    <span
      title={action}
      className={`badge max-w-full !whitespace-normal px-2.5 py-0.5 text-[0.72rem] leading-snug ${ACTION_TONES[action] || 'badge-neutral'}`}
    >
      {actionLabel(action)}
    </span>
  );
}

/**
 * Activity log table with its own scroll area (sticky header) and fixed column widths, so long
 * descriptions wrap inside their cell instead of spilling into the next column.
 * `compact` (dashboard card): time and action share the first column, the user is folded into
 * the description, and Record / IP are dropped.
 */
export default function ActivityTable({ logs, compact = false, maxHeight = '60vh' }) {
  const cols = compact ? 2 : 6;
  return (
    <div className="table-wrap" style={{ maxHeight }}>
      <table className={`w-full table-fixed border-collapse text-left ${compact ? '' : 'min-w-[760px]'}`}>
        <colgroup>
          {compact ? (
            <>
              <col className="w-[150px]" />
              <col />
            </>
          ) : (
            <>
              <col className="w-[128px]" />
              <col className="w-[110px]" />
              <col className="w-[150px]" />
              <col />
              <col className="w-[76px]" />
              <col className="w-[110px]" />
            </>
          )}
        </colgroup>
        <thead className="table-head">
          {compact ? (
            <tr><th>When / Action</th><th>Description</th></tr>
          ) : (
            <tr><th>When</th><th>User</th><th>Action</th><th>Description</th><th>Record</th><th>IP Address</th></tr>
          )}
        </thead>
        <tbody className="table-body">
          {logs === null ? (
            <tr><td colSpan={cols}><div className="flex justify-center py-10 text-slate-400"><Spinner className="h-6 w-6" /></div></td></tr>
          ) : logs.length === 0 ? (
            <tr><td colSpan={cols}><EmptyState icon={ListChecks}>No log entries match these filters.</EmptyState></td></tr>
          ) : logs.map((l) => (compact ? (
            <tr key={l.id}>
              <td className="!whitespace-normal align-top">
                <div className="mb-1.5 text-xs text-slate-500">{fmtDateTime(l.created_at)}</div>
                <ActionBadge action={l.action} />
              </td>
              <td className="!whitespace-normal break-words align-top text-slate-600">
                <b className="mr-1 text-slate-900">{l.username}:</b>
                {l.description}
              </td>
            </tr>
          ) : (
            <tr key={l.id}>
              <td className="!whitespace-normal align-top text-xs text-slate-500">{fmtDateTime(l.created_at)}</td>
              <td className="truncate align-top font-semibold" title={l.username}>{l.username}</td>
              <td className="!whitespace-normal align-top"><ActionBadge action={l.action} /></td>
              <td className="!whitespace-normal break-words align-top text-slate-600">{l.description}</td>
              <td className="align-top text-slate-500">{l.record_id ?? ''}</td>
              <td className="truncate align-top text-xs text-slate-400" title={l.ip_address}>{l.ip_address}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
