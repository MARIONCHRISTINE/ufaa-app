import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarX, CircleCheck, Copy, CreditCard as IdCard, Database, Eye, FileSpreadsheet, Flag, Hash, RefreshCw, Search, ShieldHalf,
  TriangleAlert, UserCog as UserRoundCog, UserX, Vault, X,
} from 'lucide-react';
import { EmptyState, Modal, PageHeader, Pagination, ProgressModal, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api, downloadFile } from '../../lib/api';
import { fmtDateTime, fmtNumber } from '../../lib/format';

const CHECKS = [
  { field: 'true_duplicates', mode: 'true_dup', label: 'True Duplicate Claims (Audit Required)', sub: 'Identical Account Number, ID/Passport, Last Transaction and Compilation Date (requires admin audit sign-off)', icon: Copy, dup: true },
  { field: 'recycled_accounts', mode: 'recycled', label: 'Recycled SIM Accounts', sub: 'Same Account Number but different owners/IDs (valid telecom reallocation)', icon: RefreshCw, dup: true, info: true },
  { field: 'owner_name', mode: 'missing_owner', label: 'Missing Owner Name', sub: 'Records with no owner name set', icon: UserX },
  { field: 'id_passport_no', mode: 'missing_id', label: 'Missing ID / Passport No.', sub: 'Records with no ID or passport number', icon: IdCard },
  { field: 'date_of_birth', mode: 'missing_dob', label: 'Missing Date of Birth', sub: 'Records where date of birth is not set', icon: CalendarX },
  { field: 'account_number', mode: 'missing_account', label: 'Missing Account Number', sub: 'Records with no account number', icon: Hash },
];
const EXPORT_CHUNK = 200000;
const RECORD_COLS = [
  ['record_id', 'Record'], ['owner_name', 'Owner Name'], ['id_passport_no', 'ID / Passport'], ['account_number', 'Account'],
  ['date_of_birth', 'DOB'], ['last_transaction', 'Last Transaction'], ['due_amount', 'Due Amount'],
  ['compilation_date', 'Compilation'], ['status', 'Status'],
];

function VaultCard() {
  const toast = useToast();
  const [sessions, setSessions] = useState(null);
  const [revealed, setRevealed] = useState({});
  const timers = useRef({});

  useEffect(() => {
    api('/admin/vault').then((r) => setSessions(r.sessions)).catch((e) => toast.error(e.message));
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, [toast]);

  const reveal = async (id) => {
    setRevealed((r) => ({ ...r, [id]: 'loading' }));
    try {
      const res = await api(`/admin/vault/${id}/reveal`, { method: 'POST' });
      setRevealed((r) => ({ ...r, [id]: res.protection_password }));
      toast.info('Password revealed (auto-hides in 10 seconds).');
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => setRevealed((r) => ({ ...r, [id]: undefined })), 10000);
    } catch (err) {
      setRevealed((r) => ({ ...r, [id]: undefined }));
      toast.error(err.message);
    }
  };

  const copy = (pw) => navigator.clipboard?.writeText(pw).then(() => toast.success('Password copied to clipboard!'));

  return (
    <div className="card mb-6 p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="card-title"><Vault className="h-5 w-5 text-airtel" /> File Protection &amp; Password Vault</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-400"><ShieldHalf className="h-3.5 w-3.5" /> Audited Access</span>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Registry of submission Excel batches. Each file is generated with worksheet protection. Click <b>Reveal Password</b> to view the unprotect key — every reveal is logged.
      </p>
      <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="table-head sticky top-0">
            <tr><th>Batch ID</th><th>Submission Date</th><th>Submitted By</th><th className="text-center">Records</th><th>Generated Excel File</th><th className="text-center">Unprotect Password</th></tr>
          </thead>
          <tbody className="table-body">
            {sessions === null ? (
              <tr><td colSpan={6}><div className="flex justify-center py-6 text-slate-400"><Spinner /></div></td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">No submission batches logged yet.</td></tr>
            ) : sessions.map((s) => {
              const pw = revealed[s.id];
              return (
                <tr key={s.id}>
                  <td className="whitespace-nowrap font-bold">#UB-{String(s.id).padStart(4, '0')}</td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDateTime(s.uploaded_at)}</td>
                  <td className="font-semibold">{s.uploaded_by}</td>
                  <td className="text-center"><span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">{fmtNumber(s.record_count)} rows</span></td>
                  <td className="break-all text-xs text-slate-500">{s.file_name}</td>
                  <td className="text-center">
                    {pw === 'loading' ? <Spinner className="mx-auto h-4 w-4" /> : pw ? (
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <button onClick={() => copy(pw)} className="rounded-md border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-sm font-extrabold text-airtel" title="Copy key">{pw}</button>
                        <span className="text-[0.65rem] font-bold text-red-600">Auto-hiding in 10s</span>
                      </div>
                    ) : (
                      <button onClick={() => reveal(s.id)} className="btn-outline btn-sm"><Eye className="h-3.5 w-3.5" /> Reveal Password</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordsTable({ records, groupBy }) {
  let lastGroup = null;
  let shade = false;
  return (
    <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1000px] border-collapse text-xs">
        <thead className="table-head sticky top-0">
          <tr>{RECORD_COLS.map(([, l]) => <th key={l}>{l}</th>)}</tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const g = groupBy ? r[groupBy] : null;
            if (g !== lastGroup) { shade = !shade; lastGroup = g; }
            return (
              <tr key={r.record_id} className={`border-b border-slate-100 ${groupBy && shade ? 'bg-slate-50' : 'bg-surface'}`}>
                {RECORD_COLS.map(([k]) => (
                  <td key={k} className={`px-3 py-1.5 ${k === 'record_id' ? 'font-bold text-slate-400' : ''}`}>
                    {r[k] ?? <span className="italic text-orange-500">(empty)</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DuplicatePanel({ mode, onClose, onChanged }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [data, setData] = useState(null);
  const [decision, setDecision] = useState(null);
  const recycled = mode === 'recycled';

  const load = useCallback(async () => {
    setData(null);
    try {
      setData(await api('/admin/duplicates', { params: { mode, page, search: query, filter: reviewFilter, per_page: 100 } }));
    } catch (err) {
      toast.error(err.message);
    }
  }, [mode, page, query, reviewFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = [];
  (data?.records || []).forEach((r) => {
    const last = groups[groups.length - 1];
    if (last && last.key === r.group_key) last.records.push(r);
    else groups.push({ key: r.group_key, records: [r] });
  });

  const [reassign, setReassign] = useState(null); // { key, current, officers, choice }

  const openReassign = async (key, current) => {
    setReassign({ key, current, officers: null, choice: '' });
    try {
      const { users } = await api('/admin/users');
      const officers = users.filter((u) => u.is_active && ['compliance_officer', 'both'].includes(u.role) && u.username !== current);
      setReassign((r) => r && { ...r, officers, choice: officers[0]?.username || '' });
    } catch (err) {
      toast.error(err.message);
      setReassign(null);
    }
  };

  const act = async (path, body, msg) => {
    try {
      await api(path, { method: 'POST', body });
      toast.success(msg);
      load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="mt-5 border-t-2 border-slate-200 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <strong className="text-slate-900">{recycled ? 'Recycled SIM Accounts (view only)' : 'True Duplicate Claims — Audit Review'}</strong>
        <button className="btn-ghost btn-sm" onClick={onClose}><X className="h-4 w-4" /> Close</button>
      </div>
      {data && (
        <p className="mb-3 text-sm text-slate-500">
          {fmtNumber(data.distinct_dups)} {recycled ? 'shared account numbers' : 'duplicate groups'} · {fmtNumber(data.total)} records
        </p>
      )}
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search); }}>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search account, ID, owner or record #" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!recycled && (
          <select className="input w-auto" value={reviewFilter} onChange={(e) => { setPage(1); setReviewFilter(e.target.value); }}>
            <option value="all">All groups</option>
            <option value="unreviewed">Needs a decision</option>
            <option value="awaiting">Awaiting uploader</option>
            <option value="confirmed">Resolved by uploader</option>
            <option value="cleared">Cleared (not duplicates)</option>
          </select>
        )}
        <button className="btn-outline" type="submit">Search</button>
      </form>

      {data === null ? (
        <div className="flex justify-center py-10 text-slate-400"><Spinner className="h-6 w-6" /></div>
      ) : groups.length === 0 ? (
        <EmptyState icon={CircleCheck}>No records found.</EmptyState>
      ) : recycled ? (
        <RecordsTable records={data.records} groupBy="group_key" />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const note = data.notes[g.key];
            // A review only counts while it still covers every copy; new uploads re-open the group.
            const reviewed = g.records[0].covered;
            const awaiting = reviewed && g.records[0].awaiting;
            // Green only once it is actually settled: resolved by the officer, or cleared by an admin.
            const cleared = reviewed && !awaiting && /false|cleared/i.test(note?.note || '');
            const resolved = reviewed && !awaiting && note?.note === 'Resolved by uploader';
            const total = g.records[0].group_count || g.records.length;
            const newSince = note?.reviewed && !reviewed ? total - (note.record_count || 0) : 0;
            const assignee = g.records[0].assigned_to;
            const assigneeGone = awaiting && g.records[0].assignee_active === false;
            const frame = assigneeGone
              ? 'border-red-300 bg-red-50/50'
              : awaiting ? 'border-amber-300 bg-amber-50/50'
              : resolved ? 'border-green-200 bg-green-50/40'
                : reviewed ? 'border-slate-200 bg-slate-50' : 'border-orange-200 bg-orange-50/40';
            return (
              <div key={g.key} className={`rounded-xl border p-3 ${frame}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-bold text-slate-700">Account {g.records[0].account_number} · ID {g.records[0].id_passport_no}</span>
                    <span className="ml-2 text-slate-500">{total} cop{total === 1 ? 'y' : 'ies'} in the database</span>
                    {assigneeGone ? (
                      <span className="badge badge-rose ml-2">
                        {assignee || 'The assigned officer'} is no longer active — reassign this review
                      </span>
                    ) : awaiting ? (
                      <span className="badge ml-2 border-amber-300 bg-amber-100 text-amber-800">
                        Awaiting {assignee || 'uploader'} · sent by {note?.reviewed_by || note?.noted_by || 'admin'}
                      </span>
                    ) : note && (
                      <span className={`badge ml-2 ${resolved ? 'badge-claimed' : 'badge-neutral'}`}>
                        {cleared ? 'Not a duplicate (cleared)' : note.note} · {note.reviewed_by || note.noted_by}
                      </span>
                    )}
                    {newSince > 0 && (
                      <span className="badge badge-unclaimed ml-2">
                        {note.record_count
                          ? `${newSince} new cop${newSince === 1 ? 'y' : 'ies'} uploaded since this review`
                          : 'Needs review again — copies were uploaded after the earlier review'}
                      </span>
                    )}
                  </div>
                  {awaiting && (
                    <button
                      className={assigneeGone ? 'btn btn-sm bg-airtel text-white hover:bg-airtel-dark' : 'btn-outline btn-sm'}
                      onClick={() => openReassign(g.key, assignee)}
                    >
                      <UserRoundCog className="h-3.5 w-3.5" /> Reassign
                    </button>
                  )}
                  {!reviewed && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className="btn btn-sm bg-airtel text-white hover:bg-airtel-dark"
                        onClick={() => setDecision({
                          kind: 'confirm', key: g.key, total,
                          uploader: g.records.find((r) => r.uploaded_by)?.uploaded_by,
                        })}
                      >
                        <Flag className="h-3.5 w-3.5" /> Confirm duplicate &amp; send to uploader
                      </button>
                      <button className="btn-outline btn-sm" onClick={() => setDecision({ kind: 'clear', key: g.key, total })}>
                        <CircleCheck className="h-3.5 w-3.5 text-green-600" /> Not a duplicate (clear)
                      </button>
                    </div>
                  )}
                </div>
                <RecordsTable records={g.records} />
              </div>
            );
          })}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />}

      <Modal
        open={!!reassign}
        onClose={() => setReassign(null)}
        title="Reassign duplicate review"
        icon={<UserRoundCog className="h-5 w-5 text-airtel" />}
        footer={
          <>
            <button className="btn-outline" onClick={() => setReassign(null)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!reassign?.choice}
              onClick={() => {
                const r = reassign;
                setReassign(null);
                act('/admin/duplicates/reassign', { group_key: r.key, username: r.choice }, `Review reassigned to ${r.choice}.`);
              }}
            >
              Reassign
            </button>
          </>
        }
      >
        {reassign && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              This review is currently assigned to <b>{reassign.current || 'an officer'}</b>. Choose the officer who should
              take it over. It will move to their Data Upload notification bar and disappear from{' '}
              {reassign.current || 'the previous officer'}&apos;s.
            </p>
            {reassign.officers === null ? (
              <div className="flex justify-center py-4 text-slate-400"><Spinner /></div>
            ) : reassign.officers.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                There are no other active Compliance Officer accounts. Create or reactivate one in User Management first.
              </p>
            ) : (
              <div>
                <label className="label">New officer</label>
                <select className="input" value={reassign.choice} onChange={(e) => setReassign((r) => ({ ...r, choice: e.target.value }))}>
                  {reassign.officers.map((u) => (
                    <option key={u.id} value={u.username}>{u.fullname ? `${u.fullname} (${u.username})` : u.username}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision?.kind === 'confirm' ? 'Confirm duplicate & send to uploader' : 'Not a duplicate'}
        icon={decision?.kind === 'confirm' ? <Flag className="h-5 w-5 text-airtel" /> : <CircleCheck className="h-5 w-5 text-green-600" />}
        footer={
          <>
            <button className="btn-outline" onClick={() => setDecision(null)}>Cancel</button>
            <button
              className={decision?.kind === 'confirm' ? 'btn-primary' : 'btn-success'}
              onClick={() => {
                const d = decision;
                setDecision(null);
                if (d.kind === 'confirm') {
                  act('/admin/duplicates/flag', { group_key: d.key }, 'Confirmed as a duplicate and sent to the uploader to clean up.');
                } else {
                  act('/admin/duplicates/review', { group_key: d.key, resolution: 'False Duplicate / Cleared' }, 'Marked as not a duplicate.');
                }
              }}
            >
              {decision?.kind === 'confirm' ? 'Confirm & send' : 'Clear group'}
            </button>
          </>
        }
      >
        {decision?.kind === 'confirm' ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              These <b>{decision.total} records</b> are the same claim uploaded more than once. They will be sent to{' '}
              <b>{decision.uploader || 'the officer who uploaded them'}</b> as a review file in their Data Upload page.
            </p>
            <p>
              The officer keeps the correct record and removes the extra copies. When they submit, the extra copies are
              deleted from the database — except any copy that already has a letter or claim, which is always kept.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              These <b>{decision?.total} records</b> look alike but are genuinely separate claims (for example two real
              transactions). The group is closed and <b>no records are changed</b>.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              If another copy is uploaded later, the group will come back here for review.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MissingPanel({ check, onClose }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api('/admin/missing', { params: { field: check.field, page, per_page: 100 } })
      .then(setData).catch((e) => toast.error(e.message));
  }, [check.field, page, toast]);

  return (
    <div className="mt-5 border-t-2 border-slate-200 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-slate-900">{check.label} (view only)</strong>
        <button className="btn-ghost btn-sm" onClick={onClose}><X className="h-4 w-4" /> Close</button>
      </div>
      {data === null ? (
        <div className="flex justify-center py-10 text-slate-400"><Spinner className="h-6 w-6" /></div>
      ) : data.records.length === 0 ? (
        <EmptyState icon={CircleCheck}>No records are missing this field.</EmptyState>
      ) : (
        <RecordsTable records={data.records} />
      )}
      {data && <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />}
    </div>
  );
}

export default function DataManagement() {
  const toast = useToast();
  const [counts, setCounts] = useState(null);
  const [panel, setPanel] = useState(null);
  const [exporting, setExporting] = useState(null);

  const loadCounts = useCallback(() => api('/admin/quality-counts').then(setCounts).catch((e) => toast.error(e.message)), [toast]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const startExport = async (check) => {
    try {
      const { count } = await api('/admin/export-quality', { params: { mode: check.mode, count_only: true } });
      if (!count) return toast.error('No records to export.');
      const chunks = Math.ceil(count / EXPORT_CHUNK);
      for (let i = 0; i < chunks; i++) {
        setExporting({ label: check.label, part: i + 1, chunks, percent: Math.round(((i + 0.5) / chunks) * 100) });
        const extra = chunks > 1 ? { offset: i * EXPORT_CHUNK, limit: EXPORT_CHUNK, chunk_num: i + 1, total_chunks: chunks } : {};
        await downloadFile('/admin/export-quality', { mode: check.mode, ...extra }, 'UFAA_Quality_Export.csv');
      }
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(null);
    }
    return undefined;
  };

  return (
    <div>
      <PageHeader
        icon={Database}
        title="Data Management"
        subtitle={counts ? `Inspect data quality across ${fmtNumber(counts.total)} records, review duplicates and export records.` : 'Inspect data quality, review duplicates and export records.'}
        actions={counts && (counts.all_good ? (
          <span className="badge border border-green-200 bg-green-100 px-4 py-1.5 text-sm text-green-700"><CircleCheck className="h-4 w-4" /> All Records Complete (0 Issues)</span>
        ) : (
          <span className="badge border border-red-200 bg-red-100 px-4 py-1.5 text-sm text-red-700"><TriangleAlert className="h-4 w-4" /> {fmtNumber(counts.total_issues)} Data Issues Found</span>
        ))}
      />

      <VaultCard />

      <div className="card p-5">
        <div className="mb-3 card-title"><ShieldHalf className="h-5 w-5 text-sky-600" /> Data Health &amp; Audit Registry</div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-green-700"><CircleCheck className="h-4 w-4" /> 100% Pre-Submission Upload Sanitization Active</span>
          <span className="text-xs font-semibold text-green-800">All incoming uploads are pre-validated in Data Upload before database commit.</span>
        </div>

        <div className="flex flex-col gap-3">
          {CHECKS.map((c) => {
            const n = counts ? counts[c.field] : null;
            // Duplicate groups sent to an officer are not resolved yet: keep the card open (not green).
            const awaiting = c.field === 'true_duplicates' && counts ? counts.awaiting_uploader || 0 : 0;
            const has = n > 0 || awaiting > 0;
            const tone = !has ? 'border-green-200 bg-green-50 text-green-600' : c.info ? 'border-blue-200 bg-sky-50 text-blue-600' : 'border-orange-200 bg-orange-50 text-orange-600';
            return (
              <div key={c.field} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${tone}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70"><c.icon className="h-5 w-5" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">{c.label}</div>
                    <div className="text-xs text-slate-500">{c.sub}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {!(n === 0 && awaiting > 0) && (
                    <span className="text-2xl font-bold" title={awaiting ? 'Groups needing an admin decision' : undefined}>
                      {n === null ? <Spinner className="h-5 w-5" /> : fmtNumber(n)}
                    </span>
                  )}
                  {awaiting > 0 && (
                    <span className="badge border-amber-300 bg-amber-100 text-amber-700">
                      {fmtNumber(awaiting)} awaiting uploader
                    </span>
                  )}
                  {c.field === 'true_duplicates' && counts?.awaiting_inactive > 0 && (
                    <span className="badge badge-rose">
                      {fmtNumber(counts.awaiting_inactive)} need reassigning
                    </span>
                  )}
                  {has ? (
                    <>
                      <button className="btn-outline btn-sm" onClick={() => setPanel(c)}>
                        <Search className="h-3.5 w-3.5" /> {c.info ? 'View Breakdown' : c.dup ? 'Review Groups' : 'Inspect Records'}
                      </button>
                      <button className="btn-outline btn-sm" onClick={() => startExport(c)}><FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV</button>
                    </>
                  ) : n !== null && (
                    <span className="text-sm font-semibold text-green-600"><CircleCheck className="mr-1 inline h-4 w-4" />{c.info ? 'No Recycled SIMs' : '100% Compliant'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {panel && (panel.dup
          ? <DuplicatePanel key={panel.mode} mode={panel.mode} onClose={() => setPanel(null)} onChanged={loadCounts} />
          : <MissingPanel key={panel.field} check={panel} onClose={() => setPanel(null)} />)}
      </div>

      <ProgressModal open={!!exporting} title="Exporting Records" tone="green"
        message={exporting ? `${exporting.label}\nPart ${exporting.part} of ${exporting.chunks}` : ''} percent={exporting?.percent} />
    </div>
  );
}
