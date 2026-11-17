import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  ArrowRightToLine, CloudUpload, Eye, FileSpreadsheet, Flag, FolderOpen, Lock, PenSquare, RefreshCw, Trash2,
  TriangleAlert,
} from 'lucide-react';
import { EmptyState, Modal, PageHeader, ProgressModal, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { TemplateButton } from './Home';

const MAX_ROWS = 500000;
const CHUNK_SIZE = 15000;

const COLUMN_ALIASES = {
  owner_name: ['owner_name', 'holder_name', 'customer_name', 'full_name', 'owner', 'name', 'holder'],
  id_passport_no: ['passport', 'id_number', 'id_no', 'national_id', 'id_num', 'id'],
  date_of_birth: ['date_of_birth', 'birth_date', 'dob', 'birth'],
  account_number: ['account_number', 'account_no', 'acc_no', 'account', 'acct'],
  last_transaction: ['last_transaction', 'transaction_date', 'last_tx_date', 'last_tx', 'transaction'],
  due_amount: ['due_amount', 'amount_due', 'amount', 'due', 'kes', 'balance', 'value'],
  compilation_date: ['compilation_date', 'compiled_date', 'compilation', 'compiled', 'date_compiled'],
};
const FIELD_ORDER = Object.keys(COLUMN_ALIASES);

// Find a header column: exact match first, then word-boundary match for short keys, then "contains".
function colIdx(headers, keys) {
  for (const k of keys) {
    const exact = headers.indexOf(k);
    if (exact >= 0) return exact;
  }
  for (const k of keys) {
    const found = headers.findIndex((h) =>
      k.length <= 2 ? new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i').test(h) : h.includes(k));
    if (found >= 0) return found;
  }
  return -1;
}

const raw = (v) => (v === null || v === undefined ? '' : String(v).trim());
const tick = () => new Promise((r) => setTimeout(r, 0));

export default function DataUpload() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [drafts, setDrafts] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const fileInput = useRef(null);
  const uploading = useRef(false);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await api('/drafts');
      setDrafts(res.drafts);
      setFlagged(res.flagged || []);
    } catch {
      /* keep the last list while the server is unreachable */
    }
  }, []);

  useEffect(() => {
    loadDrafts();
    const timer = setInterval(loadDrafts, 4000);
    return () => clearInterval(timer);
  }, [loadDrafts]);

  useEffect(() => {
    if (params.get('open_file') === '1') {
      setParams({}, { replace: true });
      setTimeout(() => fileInput.current?.click(), 150);
    }
  }, [params, setParams]);

  // Warn before leaving while an upload is running.
  useEffect(() => {
    const handler = (e) => {
      if (!uploading.current) return undefined;
      e.preventDefault();
      e.returnValue = 'Upload is currently in progress. Leaving this page will abort the upload.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const fail = (message) => {
    uploading.current = false;
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
    toast.error(message);
  };

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Unsupported format! Please upload an Excel file (.xlsx, .xls) or a CSV file (.csv).');
      return;
    }
    uploading.current = true;
    setProgress({ name: file.name, percent: 5, status: 'Reading worksheet rows…', detail: 'Parsing Excel data structures…' });
    await new Promise((r) => setTimeout(r, 50));

    try {
      const buffer = await file.arrayBuffer();
      setProgress((p) => ({ ...p, percent: 10, status: 'Parsing worksheet…' }));
      await tick();
      // For CSV, raw:true keeps every value as typed; otherwise SheetJS reformats dates like 02/02/1980 to 2/2/80.
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, raw: ext === 'csv' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return fail('No worksheet found in uploaded file.');

      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        const approx = range.e.r - range.s.r;
        if (approx > MAX_ROWS) {
          return fail(`The file contains ${approx.toLocaleString()} rows, which exceeds the ${MAX_ROWS.toLocaleString()} row limit. Please split the file.`);
        }
      }

      // raw:false keeps the formatted text (leading zeros like 0712345678, dates as typed).
      const sheet = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      if (!sheet || sheet.length < 2) return fail('No data rows found in uploaded file.');

      const headers = sheet[0].map((h) => String(h).trim().toLowerCase());
      const cols = Object.fromEntries(FIELD_ORDER.map((f) => [f, colIdx(headers, COLUMN_ALIASES[f])]));

      const rows = [];
      for (let i = 1; i < sheet.length; i++) {
        const r = sheet[i];
        if (!r || r.every((c) => String(c).trim() === '')) continue;
        const row = {};
        FIELD_ORDER.forEach((f, pos) => {
          row[f] = raw(cols[f] >= 0 ? r[cols[f]] : r[pos]);
        });
        rows.push(row);
        if (i % 25000 === 0) {
          setProgress((p) => ({ ...p, detail: `Parsed ${i.toLocaleString()} / ${sheet.length.toLocaleString()} rows…` }));
          await tick();
        }
      }
      if (rows.length > MAX_ROWS) {
        return fail(`The file contains ${rows.length.toLocaleString()} rows, which exceeds the ${MAX_ROWS.toLocaleString()} row limit.`);
      }
      if (!rows.length) return fail('No data rows found in uploaded file.');

      const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
      let draftId = 0;
      for (let c = 0; c < totalChunks; c++) {
        const start = c * CHUNK_SIZE;
        const end = Math.min(rows.length, start + CHUNK_SIZE);
        const pct = Math.round(((c + 1) / totalChunks) * 100);
        setProgress((p) => ({
          ...p,
          percent: Math.max(10, pct),
          status: `Uploading chunk ${c + 1} of ${totalChunks} (${pct}%)…`,
          detail: `${end.toLocaleString()} / ${rows.length.toLocaleString()} rows transferred`,
        }));
        const res = await api('/drafts/upload-chunk', {
          method: 'POST',
          body: { draft_id: draftId, draft_name: file.name, chunk_index: c, total_chunks: totalChunks, rows: rows.slice(start, end) },
        });
        draftId = res.draft_id;
        if (res.is_final) {
          setProgress((p) => ({ ...p, percent: 100, status: 'Upload complete! Launching Web-Excel Editor…' }));
          uploading.current = false;
          navigate(`/upload/${draftId}`);
          return undefined;
        }
      }
    } catch (err) {
      return fail(`File processing error: ${err.message}`);
    }
    return undefined;
  };

  const confirmDelete = async () => {
    const d = toDelete;
    setToDelete(null);
    try {
      await api(`/drafts/${d.id}`, { method: 'DELETE' });
      toast.success(`Deleted working file "${d.draft_name}".`);
      loadDrafts();
    } catch (err) {
      toast.error(err.message);
    }
  };


  return (
    <div>
      <PageHeader
        icon={CloudUpload}
        title="Data Upload & Pre-Submission Portal"
        subtitle="Upload a new Excel asset report or select an active working draft below to open the Web-Excel Editor."
        actions={<TemplateButton label="Download Standard Template" />}
      />

      {flagged.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50 shadow-[0_4px_14px_rgba(217,119,6,0.12)]">
          <div className="flex items-center gap-4 border-b border-amber-200 px-6 py-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600"><TriangleAlert className="h-6 w-6" /></div>
            <div>
              <div className="font-extrabold text-amber-900">
                {flagged.length} file{flagged.length > 1 ? 's' : ''} flagged for your review
              </div>
              <div className="text-sm text-amber-700">
                An administrator found possible duplicate claims in records you uploaded. Only you can see and resolve these.
              </div>
            </div>
          </div>
          <ul className="divide-y divide-amber-200">
            {flagged.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Flag className="h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-900">{d.draft_name}</div>
                    <div className="text-xs text-amber-800">
                      {d.flagged_reason}
                      {d.flagged_by && <> · Flagged by <b>{d.flagged_by}</b></>}
                      {d.flagged_at && <> · {fmtDateTime(d.flagged_at)}</>}
                      {' · '}{Number(d.approx_rows).toLocaleString()} row{d.approx_rows !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <Link to={`/upload/${d.id}`} className="btn bg-amber-600 text-white hover:bg-amber-700">
                  <PenSquare className="h-4 w-4" /> Resolve in Editor
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
        className={`mb-7 cursor-pointer rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? 'border-airtel bg-red-50' : 'border-slate-300 bg-surface hover:border-slate-400'
        }`}
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-red-300 bg-red-50 text-airtel shadow">
          <CloudUpload className="h-8 w-8" />
        </div>
        <p className="text-lg font-extrabold text-slate-900">Drag &amp; Drop Excel File Here</p>
        <p className="mb-3 text-sm text-slate-500">or <span className="font-bold text-airtel underline">click to browse computer</span></p>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500">
          Supports .xlsx · .xls · .csv — Max 500,000 records per batch — Single worksheet format
        </span>
      </div>
      <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-extrabold text-slate-900">
          <FolderOpen className="h-5 w-5 text-slate-500" /> Active Working Files (Drafts)
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">● Live Sync</span>
        </div>
        <button onClick={loadDrafts} className="btn-ghost btn-sm"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <div className="flex flex-col gap-2.5">
        {drafts === null ? (
          <div className="flex justify-center py-8 text-slate-400"><Spinner className="h-6 w-6" /></div>
        ) : drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-surface">
            <EmptyState icon={FolderOpen}>No working files yet — upload an Excel file above to open the Editor.</EmptyState>
          </div>
        ) : (
          drafts.map((d) => {
            const isFlagged = d.status === 'flagged';
            return (
              <div key={d.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3.5 transition hover:shadow-md ${isFlagged ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-surface'}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${isFlagged ? 'border-amber-300 bg-amber-100 text-amber-600' : 'border-red-200 bg-red-50 text-airtel'}`}>
                    {isFlagged ? <Flag className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-extrabold text-slate-900">
                      <span className="truncate">{d.draft_name}</span>
                      {isFlagged && (
                        <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                          Flagged Duplicate — Action Required
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        {Number(d.approx_rows).toLocaleString()} row{d.approx_rows !== 1 ? 's' : ''} · Last edit by <b>{d.last_edited_by}</b> · {fmtRelative(d.updated_at)}
                      </span>
                      {d.editor_count > 0 && (
                        <span className="rounded-md bg-green-100 px-2 py-0.5 font-bold text-green-700"><PenSquare className="mr-1 inline h-3 w-3" />{d.editor_count} editing live</span>
                      )}
                      {d.viewer_count > 0 && (
                        <span className="rounded-md bg-sky-100 px-2 py-0.5 font-semibold text-sky-700"><Eye className="mr-1 inline h-3 w-3" />{d.viewer_count} viewing</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/upload/${d.id}`} className={isFlagged ? 'btn bg-amber-600 text-white hover:bg-amber-700' : 'btn-primary'}>
                    {isFlagged ? <PenSquare className="h-4 w-4" /> : <ArrowRightToLine className="h-4 w-4" />}
                    {isFlagged ? 'Resolve in Editor' : 'Open Editor'}
                  </Link>
                  <button onClick={() => setToDelete(d)} className="btn-outline text-red-600" title="Delete draft"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete working file?"
        footer={
          <>
            <button className="btn-outline" onClick={() => setToDelete(null)}>Cancel</button>
            <button className="btn-primary" onClick={confirmDelete}><Trash2 className="h-4 w-4" /> Delete</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <b>{toDelete?.draft_name}</b> and all of its rows? This cannot be undone.
        </p>
      </Modal>

      <ProgressModal
        open={!!progress}
        title="Uploading to Data Sanitizer"
        message={progress ? `${progress.name}\n${progress.status}` : ''}
        percent={progress?.percent}
        detail={
          <span className="flex items-center justify-center gap-2 text-amber-700">
            <Lock className="h-3.5 w-3.5" /> {progress?.detail} — please don&apos;t close or refresh this tab.
          </span>
        }
      />
    </div>
  );
}
