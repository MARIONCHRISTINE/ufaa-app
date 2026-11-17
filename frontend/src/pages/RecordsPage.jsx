import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Clock, FileArchive, FileCheck2, FileSignature, FileSpreadsheet, FileText, Filter, FolderOpen,
  Hourglass, Lock, Paperclip, Printer, RotateCcw, Send,
} from 'lucide-react';
import { EmptyState, Modal, Pagination, ProgressModal, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, downloadFile, openFile } from '../lib/api';
import { fmtDateTime } from '../lib/format';

const TITLES = {
  all: null,
  claimed: { title: 'Claimed Assets', icon: CheckCircle2 },
  unclaimed: { title: 'Unclaimed Assets', icon: Hourglass },
  letters: { title: 'Letters Issued Hub', icon: FileText },
};

const FILTER_KEYS = ['owner_name', 'id_no', 'account_no', 'amount', 'status', 'letter', 'compilation_start', 'compilation_end'];
const EXPORT_CHUNK = 200000;

function StatusBadge({ status, saving, onClick }) {
  if (saving) {
    return (
      <span className="badge badge-neutral opacity-70"><Spinner className="h-3 w-3" /> Saving…</span>
    );
  }
  if (status === 'Claimed') {
    return (
      <span className="badge badge-claimed cursor-default" title="Permanently locked as Claimed">
        <Lock className="h-3 w-3" /> Claimed
      </span>
    );
  }
  const map = {
    'Letter Generated': { cls: 'badge-letter', icon: FileSignature, label: 'Letter Issued' },
    Submitted: { cls: 'badge-submitted', icon: Send, label: 'Submitted' },
  };
  const { cls, icon: Icon, label } = map[status] || { cls: 'badge-unclaimed', icon: Hourglass, label: 'Unclaimed' };
  return (
    <button onClick={onClick} className={`badge ${cls} transition-transform hover:scale-105`} title="Click to change claim status">
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export default function RecordsPage({ scope = 'all', top = null, onDataChanged }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])));
  const [data, setData] = useState({ records: [], total: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [statusModal, setStatusModal] = useState(null);
  const [exporting, setExporting] = useState(null);
  const fileInput = useRef(null);
  const uploadTarget = useRef(null);

  const page = Number(params.get('page') || 1);
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const filterKey = JSON.stringify(filters);
  const hasFilters = Object.values(filters).some(Boolean);
  const meta = TITLES[scope];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/assets', { params: { scope, page, ...JSON.parse(filterKey) } });
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [scope, page, filterKey, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e) => {
    e?.preventDefault();
    const next = {};
    Object.entries(form).forEach(([k, v]) => v.trim() && (next[k] = v.trim()));
    setParams(next);
  };

  const reset = () => {
    setForm(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])));
    setParams({});
  };

  const goPage = (p) => {
    const next = Object.fromEntries(params.entries());
    next.page = String(p);
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const patchRow = (id, changes) =>
    setData((d) => ({ ...d, records: d.records.map((r) => (r.record_id === id ? { ...r, ...changes } : r)) }));

  const setStatus = async (id, value) => {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await api(`/assets/${id}`, { method: 'PATCH', body: { field: 'status', value } });
      patchRow(id, { status: value });
      toast.success(res.message);
      onDataChanged?.();
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const onBadgeClick = (row) => {
    if (row.status === 'Claimed') {
      toast.error('This record is permanently locked as Claimed and cannot be changed.');
    } else if (row.status === 'Unclaimed') {
      toast.error('Please issue holder letter first to mark claimed.');
    } else {
      setStatusModal(row);
    }
  };

  // Opening the printable letter marks the letter as issued; the record then becomes Claimed and locked.
  const onLetterOpened = (row) => {
    if (row.status === 'Claimed') return;
    setSaving((s) => ({ ...s, [row.record_id]: true }));
    const attempt = async (tries) => {
      try {
        await api(`/assets/${row.record_id}`, { method: 'PATCH', body: { field: 'status', value: 'Claimed' } });
        patchRow(row.record_id, { status: 'Claimed', letter_generated: 'Yes', letter_generated_date: row.letter_generated_date || new Date().toISOString() });
        toast.success('Holder letter generated — status automatically set to Claimed and locked.');
        onDataChanged?.();
        setSaving((s) => ({ ...s, [row.record_id]: false }));
      } catch (err) {
        if (tries > 0 && err.status === 403) {
          setTimeout(() => attempt(tries - 1), 1500);
          return;
        }
        toast.error('Letter opened but status update failed. Please refresh and try again.');
        setSaving((s) => ({ ...s, [row.record_id]: false }));
      }
    };
    setTimeout(() => attempt(3), 1200);
  };

  const pickStamped = (id) => {
    uploadTarget.current = id;
    fileInput.current?.click();
  };

  const uploadStamped = async (e) => {
    const file = e.target.files?.[0];
    const id = uploadTarget.current;
    e.target.value = '';
    if (!file || !id) return;
    toast.info('Uploading stamped copy…');
    const form = new FormData();
    form.append('letter_file', file);
    try {
      const res = await api(`/assets/${id}/stamped`, { method: 'POST', form });
      patchRow(id, { stamped_file_path: res.stamped_file_path, has_stamped_copy: true });
      toast.success('Stamped copy uploaded successfully!');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const viewStamped = (id) => openFile(`/assets/${id}/stamped`).catch((err) => toast.error(err.message));

  const exportExcel = async () => {
    const exportParams = { scope, ...filters };
    try {
      toast.info('Calculating export size…');
      const { count } = await api('/assets/export', { params: { ...exportParams, count_only: true } });
      if (!count) {
        toast.error('No matching records found to export.');
        return;
      }
      const chunks = Math.ceil(count / EXPORT_CHUNK);
      for (let i = 0; i < chunks; i++) {
        setExporting({ part: i + 1, chunks, percent: Math.round(((i + 0.5) / chunks) * 100) });
        const chunkParams = chunks > 1
          ? { offset: i * EXPORT_CHUNK, limit: EXPORT_CHUNK, chunk_num: i + 1, total_chunks: chunks }
          : {};
        await downloadFile('/assets/export', { ...exportParams, ...chunkParams }, 'UFAA_Export.csv');
      }
      toast.success(chunks > 1 ? `All ${chunks} export parts downloaded.` : 'Export downloaded.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(null);
    }
  };

  const downloadZip = async () => {
    try {
      toast.info('Preparing letters ZIP…');
      await downloadFile('/letters/zip', filters, 'UFAA_Letters.zip');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const showLastTx = scope === 'all';
  const statusOptions = scope === 'letters'
    ? [['', '-- All Stages --'], ['Unclaimed', 'Unclaimed'], ['Letter Generated', 'Letter Issued'], ['Submitted', 'Submitted to UFAA'], ['Claimed', 'Claimed']]
    : [['', '-- All Statuses --'], ['Unclaimed', 'Unclaimed Only'], ['Claimed', 'Claimed Only']];
  const colCount = showLastTx ? 10 : 9;
  const offset = (data.page - 1) * (data.per_page || 100);

  const textArea = (key, placeholder) => (
    <textarea
      rows={1}
      className="input resize-y"
      placeholder={placeholder}
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) apply(e);
      }}
    />
  );

  return (
    <div>
      {top}
      <div className="card p-6" id="records-section">
        {meta && (
          <h2 className="mb-6 flex items-center gap-2 text-[1.5rem] font-bold text-airtel">
            <meta.icon className="h-5 w-5" /> {meta.title}
          </h2>
        )}

        <form onSubmit={apply} className="filters-panel mb-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <FilterField label="Owner Name">{textArea('owner_name', 'Search name(s)… (comma/newline separated)')}</FilterField>
            <FilterField label="ID / Passport No">{textArea('id_no', 'Search ID/Passport(s)…')}</FilterField>
            <FilterField label="Account Number">{textArea('account_no', 'Search account(s)…')}</FilterField>
            <FilterField label="Amount">
              <input className="input" placeholder="e.g. 5000" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </FilterField>
            {(scope === 'all' || scope === 'letters') && (
              <FilterField label={scope === 'letters' ? 'Claim Stage' : 'Claim Status'}>
                <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FilterField>
            )}
            {scope !== 'letters' && (
              <FilterField label="Letter Issued">
                <select className="input" value={form.letter} onChange={(e) => setForm((f) => ({ ...f, letter: e.target.value }))}>
                  <option value="">-- All Letters --</option>
                  <option value="Yes">Letter Issued</option>
                  <option value="No">No Letter Issued</option>
                </select>
              </FilterField>
            )}
            <FilterField label="Compilation Start">
              <input type="date" className="input" value={form.compilation_start} onChange={(e) => setForm((f) => ({ ...f, compilation_start: e.target.value }))} />
            </FilterField>
            <FilterField label="Compilation End">
              <input type="date" className="input" value={form.compilation_end} onChange={(e) => setForm((f) => ({ ...f, compilation_end: e.target.value }))} />
            </FilterField>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button type="submit" className="btn-primary"><Filter className="h-4 w-4" /> Apply Filters</button>
              {hasFilters && (
                <button type="button" onClick={reset} className="btn-outline"><RotateCcw className="h-4 w-4" /> Reset</button>
              )}
            </div>
            {scope === 'letters' ? (
              <button type="button" onClick={downloadZip} className="btn bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.2)] hover:-translate-y-px hover:bg-blue-700">
                <FileArchive className="h-4 w-4" /> Download Letters ZIP
              </button>
            ) : (
              <button type="button" onClick={exportExcel} className="btn-success hover:-translate-y-px">
                <FileSpreadsheet className="h-4 w-4" /> Download Excel
              </button>
            )}
          </div>
        </form>

        <div className="table-wrap max-h-[600px]">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead className="table-head">
              <tr>
                <th className="w-12">#</th>
                <th>Owner Name</th>
                <th>ID / Passport No</th>
                <th>Account Number</th>
                {showLastTx && <th>Last Transaction</th>}
                <th>Due Amount</th>
                <th>Compilation Date</th>
                <th className="text-center">{scope === 'letters' ? 'Claim Stage' : 'Status'}</th>
                <th className="text-center">Generated Letter PDF</th>
                <th>Stamped Copy &amp; Timestamp</th>
              </tr>
            </thead>
            <tbody className="table-body">
              {loading ? (
                <tr><td colSpan={colCount}><div className="flex justify-center py-12 text-slate-400"><Spinner className="h-6 w-6" /></div></td></tr>
              ) : data.records.length === 0 ? (
                <tr><td colSpan={colCount}><EmptyState icon={FolderOpen}>No asset records found matching search or filter parameters.</EmptyState></td></tr>
              ) : (
                data.records.map((r, i) => (
                  <tr key={r.record_id}>
                    <td className="font-semibold text-slate-400">{offset + i + 1}</td>
                    <td className="font-semibold text-slate-900">{r.owner_name || <span className="italic text-slate-400">Not Provided</span>}</td>
                    <td>{r.id_passport_no || <span className="text-slate-300">-</span>}</td>
                    <td>{r.account_number || <span className="text-slate-300">-</span>}</td>
                    {showLastTx && <td>{r.last_transaction || <span className="text-slate-300">-</span>}</td>}
                    <td className="font-bold text-airtel">{r.due_amount || <span className="text-slate-300">-</span>}</td>
                    <td>{r.compilation_date || '-'}</td>
                    <td className="text-center">
                      <StatusBadge status={r.status} saving={saving[r.record_id]} onClick={() => onBadgeClick(r)} />
                    </td>
                    <td className="text-center">
                      <a
                        href={`/letters/${r.record_id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onLetterOpened(r)}
                        className="btn-pdf"
                        title="View & print the official holder confirmation letter"
                      >
                        <Printer className="h-3.5 w-3.5" /> View / Print Letter
                      </a>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => pickStamped(r.record_id)} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-500 transition hover:border-airtel hover:bg-red-600/[0.08] hover:text-airtel" title="Attach or replace stamped/scanned copy">
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                        {r.has_stamped_copy ? (
                          <button onClick={() => viewStamped(r.record_id)} className="inline-flex items-center gap-1 text-[0.82rem] font-bold text-airtel hover:underline">
                            <FileCheck2 className="h-3.5 w-3.5" /> View Stamped Copy
                          </button>
                        ) : (
                          <span className="text-xs italic text-slate-400">No Stamped Copy</span>
                        )}
                        {r.letter_generated_date && (
                          <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[0.7rem] text-slate-600" title="Letter generated timestamp">
                            <Clock className="h-3 w-3 text-airtel" /> {fmtDateTime(r.letter_generated_date)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onChange={goPage} />
      </div>

      <input ref={fileInput} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={uploadStamped} />

      <Modal
        open={!!statusModal}
        onClose={() => setStatusModal(null)}
        title="Update Claim Status"
        footer={
          <>
            <button className="btn-outline" onClick={() => setStatusModal(null)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={async () => {
                const row = statusModal;
                setStatusModal(null);
                await setStatus(row.record_id, 'Claimed');
              }}
            >
              <Lock className="h-4 w-4" /> Mark as Claimed
            </button>
          </>
        }
      >
        {statusModal && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              <b className="text-slate-900">{statusModal.owner_name || 'This record'}</b> is currently{' '}
              <b>{statusModal.status === 'Letter Generated' ? 'Letter Issued' : statusModal.status}</b>.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              Marking a record as <b>Claimed</b> locks it permanently. This cannot be undone.
            </p>
          </div>
        )}
      </Modal>

      <ProgressModal
        open={!!exporting}
        title="Exporting Dataset"
        message={exporting ? `Downloading part ${exporting.part} of ${exporting.chunks}…` : ''}
        percent={exporting?.percent}
        detail="Large exports are split into files of 200,000 rows."
        tone="green"
      />
    </div>
  );
}
