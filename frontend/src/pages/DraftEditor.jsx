import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, CalendarCheck, ChevronDown, CheckCircle2, CircleAlert, CloudUpload, Copy, Crosshair, Database,
  Download, Eye, FileDown, Filter, Layers, Lock, PenSquare, Redo2, ShieldHalf, Trash2, TriangleAlert, Undo2,
  X,
} from 'lucide-react';
import { EmptyState, Modal, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, downloadFile } from '../lib/api';
import { fmtDateTime, initials } from '../lib/format';

const FIELDS = ['owner_name', 'id_passport_no', 'date_of_birth', 'account_number', 'last_transaction', 'due_amount', 'compilation_date'];
const LABELS = {
  owner_name: 'Owner Name', id_passport_no: 'ID / Passport No', date_of_birth: 'Date of Birth',
  account_number: 'Account Number', last_transaction: 'Last Transaction', due_amount: 'Due Amount (KES)',
  compilation_date: 'Compilation Date',
};
const REQUIRED = {
  owner_name: 'Owner Name is required', id_passport_no: 'ID / Passport No is required',
  date_of_birth: 'Date of Birth is required', account_number: 'Account Number is required',
  last_transaction: 'Last Transaction is required', due_amount: 'Due Amount is required',
  compilation_date: 'Compilation Date is required',
};
const COL_WIDTH = {
  owner_name: 'min-w-[160px]', id_passport_no: 'min-w-[130px]', date_of_birth: 'min-w-[110px]', account_number: 'min-w-[140px]',
  last_transaction: 'min-w-[150px]', due_amount: 'min-w-[120px]', compilation_date: 'min-w-[130px]',
};
const FILTERS = {
  all: 'Showing All Rows', clean: 'Filtered: Clean Rows Only', critical: 'Filtered: Critical Errors Only',
  warnings: 'Filtered: Warnings Only', duplicates: 'Filtered: Duplicate Conflicts Only',
};
const PAGE_SIZES = [1000, 5000, 10000, 50000];
const ROW_HEIGHT = 38;
const BUFFER_ROWS = 25;
const MAX_HISTORY = 20;
const PATCH_BATCH = 5000;
const CLEAN = Object.freeze({ errors: {}, warnings: {}, copies: [], db: null, hasCrit: false, hasWarn: false, isDup: false });

function dupKey(r) {
  const id = String(r.id_passport_no || '').trim().toUpperCase();
  const acct = String(r.account_number || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
  const tx = String(r.last_transaction || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!acct && !id) return '';
  return `${id}|${acct}|${tx}`;
}

// Normalise common day/month/year spellings to YYYY-MM-DD (day-first when ambiguous, as in Kenya).
function flexDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const yr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
    return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return s;
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function Avatar({ name, color, size = 'h-8 w-8', onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`${size} -ml-1.5 flex items-center justify-center rounded-full border-2 border-white text-[0.7rem] font-extrabold text-white shadow`}
      style={{ background: color }}>
      {initials(name)}
    </button>
  );
}

function SummaryCard({ id, label, value, icon: Icon, tone, active, onClick }) {
  return (
    <button type="button" onClick={() => onClick(id)}
      className={`card flex items-center justify-between gap-3 p-4 text-left transition hover:shadow-md ${active ? 'ring-2 ring-blue-600' : ''}`}>
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`mt-1 text-2xl font-extrabold ${tone}`}>{Number(value).toLocaleString()}</div>
      </div>
      <Icon className={`h-7 w-7 ${tone}`} />
    </button>
  );
}

export default function DraftEditor() {
  const { draftId } = useParams();
  const id = Number(draftId);
  const navigate = useNavigate();
  const toast = useToast();

  const rowsRef = useRef([]);
  const issuesRef = useRef(new Map());
  const dbDupRef = useRef(new Map());
  const dupDetailsRef = useRef([]);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const lastTsRef = useRef(0);
  const validateTimer = useRef(null);
  const validatingRef = useRef(false);
  const validatePending = useRef(false);
  const stoppedRef = useRef(false);
  const scrollRef = useRef(null);
  const pendingScroll = useRef(null);

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50000);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(580);
  const [editing, setEditing] = useState(null);
  const [presence, setPresence] = useState([]);
  const [viewers, setViewers] = useState([]);
  const [validating, setValidating] = useState(false);
  const [notice, setNotice] = useState('');
  const [dupRid, setDupRid] = useState(null);
  const [inspector, setInspector] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [closedBy, setClosedBy] = useState(null);
  const [popover, setPopover] = useState(null);
  const [flash, setFlash] = useState(null);
  // Mirrors `editing` during render so a cell input that is being removed can tell it is no longer active.
  const editingRef = useRef(null);
  editingRef.current = editing;

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? '' : n)), 2500);
  }, []);

  // ── Derived state: duplicate groups and per-row error/warning flags ─────────────
  const derived = useMemo(() => {
    const rows = rowsRef.current;
    const keys = new Array(rows.length);
    const groups = new Map();
    rows.forEach((r, i) => {
      const k = dupKey(r);
      keys[i] = k;
      if (!k) return;
      const g = groups.get(k);
      if (g) g.push(i);
      else groups.set(k, [i]);
    });

    const counts = { total: rows.length, clean: 0, critical: 0, warnings: 0, duplicates: 0, dbDup: 0, inFileExtra: 0 };
    groups.forEach((g) => { if (g.length > 1) counts.inFileExtra += g.length - 1; });

    const info = rows.map((r, i) => {
      const iss = issuesRef.current.get(r._rid);
      const grp = keys[i] ? groups.get(keys[i]) : null;
      const copies = grp && grp.length > 1 ? grp.filter((x) => x !== i) : [];
      const db = dbDupRef.current.get(r._rid) || null;
      const missing = FIELDS.filter((f) => !String(r[f] ?? '').trim());
      if (!iss && !copies.length && !db && !missing.length) {
        counts.clean++;
        return CLEAN;
      }
      const errors = { ...(iss?.errors || {}) };
      const warnings = { ...(iss?.warnings || {}) };
      if (errors.account_number && /duplicate/i.test(errors.account_number)) delete errors.account_number;
      missing.forEach((f) => { if (!errors[f]) errors[f] = REQUIRED[f]; });
      if (db) {
        errors.account_number = `True DB Duplicate: ID, Account and Last Transaction match database record #${db.db_id} (${db.db_owner_name || ''})`;
      } else if (copies.length) {
        const list = copies.slice(0, 5).map((c) => `#${c + 1}`).join(', ');
        errors.account_number = `True In-File Duplicate: matches row(s) ${list}${copies.length > 5 ? '…' : ''}`;
      }
      const hasCrit = Object.keys(errors).length > 0;
      const hasWarn = Object.keys(warnings).length > 0;
      const isDup = !!db || copies.length > 0;
      if (hasCrit) counts.critical++;
      if (hasWarn) counts.warnings++;
      if (!hasCrit && !hasWarn) counts.clean++;
      if (isDup) counts.duplicates++;
      if (db) counts.dbDup++;
      return { errors, warnings, copies, db, hasCrit, hasWarn, isDup };
    });

    const ridToIdx = new Map(rows.map((r, i) => [r._rid, i]));
    return { info, groups, counts, ridToIdx };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const filtered = useMemo(() => {
    const { info } = derived;
    if (filter === 'all') return info.map((_, i) => i);
    const out = [];
    info.forEach((x, i) => {
      if ((filter === 'clean' && !x.hasCrit && !x.hasWarn)
        || (filter === 'critical' && x.hasCrit)
        || (filter === 'warnings' && x.hasWarn)
        || (filter === 'duplicates' && x.isDup)) out.push(i);
    });
    return out;
  }, [derived, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageCount = Math.max(0, Math.min(filtered.length, pageStart + pageSize) - pageStart);
  const winStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const winEnd = Math.min(pageCount, winStart + Math.ceil(viewportH / ROW_HEIGHT) + BUFFER_ROWS * 2);

  const presenceMap = useMemo(() => {
    const m = new Map();
    presence.forEach((p) => m.set(`${p.rid}:${p.field}`, p));
    return m;
  }, [presence]);

  // ── Server validation (debounced, never two at once) ───────────────────────────
  const validate = useCallback(async () => {
    if (stoppedRef.current) return;
    if (validatingRef.current) {
      validatePending.current = true;
      return;
    }
    validatingRef.current = true;
    setValidating(true);
    try {
      const res = await api(`/drafts/${id}/validate`, { method: 'POST' });
      issuesRef.current = new Map(Object.entries(res.row_issues || {}).map(([rid, v]) => [Number(rid), v]));
      const db = new Map();
      (res.duplicate_details || []).forEach((d) => { if (d.type === 'database' && d.rid !== undefined) db.set(d.rid, d); });
      dbDupRef.current = db;
      dupDetailsRef.current = res.duplicate_details || [];
      bump();
    } catch (err) {
      if (err.status !== 409) console.error('Validation failed', err);
    } finally {
      validatingRef.current = false;
      setValidating(false);
      if (validatePending.current) {
        validatePending.current = false;
        validate();
      }
    }
  }, [id, bump]);

  const scheduleValidate = useCallback(() => {
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(validate, 1200);
  }, [validate]);

  // ── Load draft ─────────────────────────────────────────────────────────────────
  const loadDraft = useCallback(async (initial = false) => {
    try {
      const data = await api(`/drafts/${id}`);
      if (data.status === 'closed') {
        if (initial) {
          toast.error(data.message);
          navigate('/upload', { replace: true });
        } else {
          stoppedRef.current = true;
          setClosedBy(data.submitted_by);
        }
        return;
      }
      rowsRef.current = (data.rows || []).sort((a, b) => a._rid - b._rid);
      lastTsRef.current = data.updated_ts;
      setMeta(data);
      setPresence(data.presence || []);
      setViewers(data.viewers || []);
      undoRef.current = [];
      redoRef.current = [];
      bump();
      validate();
    } catch (err) {
      toast.error(`Could not open file: ${err.message}`);
      if (initial) navigate('/upload', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast, bump, validate]);

  useEffect(() => {
    stoppedRef.current = false;
    loadDraft(true);
    return () => {
      stoppedRef.current = true;
      clearTimeout(validateTimer.current);
    };
  }, [loadDraft]);

  // ── Live sync, heartbeat ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return undefined;
    const beat = async () => {
      if (stoppedRef.current) return;
      try {
        const res = await api(`/drafts/${id}/heartbeat`, { method: 'POST' });
        setViewers(res.viewers || []);
      } catch { /* ignore */ }
    };
    const poll = async () => {
      if (stoppedRef.current || validatingRef.current) return;
      try {
        const data = await api(`/drafts/${id}/sync`);
        if (data.status === 'closed') {
          stoppedRef.current = true;
          setClosedBy(data.submitted_by);
          return;
        }
        setPresence(data.presence || []);
        setViewers(data.viewers || []);
        setMeta((m) => ({ ...m, draft_status: data.draft_status, flagged_reason: data.flagged_reason, last_edited_by: data.last_edited_by }));
        if (data.updated_ts && data.updated_ts !== lastTsRef.current) {
          lastTsRef.current = data.updated_ts;
          if (data.last_edited_by && data.last_edited_by !== data.current_user) {
            await loadDraft(false);
            showNotice(`Live update from ${data.last_edited_by}`);
          }
        }
      } catch { /* ignore */ }
    };
    beat();
    const hb = setInterval(beat, 8000);
    const pt = setInterval(poll, 3500);
    return () => {
      clearInterval(hb);
      clearInterval(pt);
    };
  }, [loading, id, loadDraft, showNotice]);

  // ── Mutations (all optimistic; persisted in the background) ────────────────────
  const persist = useCallback(async (path, body) => {
    try {
      const res = await api(`/drafts/${id}${path}`, { method: 'POST', body });
      if (res.updated_ts) lastTsRef.current = res.updated_ts;
    } catch (err) {
      toast.error(`Could not save change: ${err.message}`);
    }
  }, [id, toast]);

  const applyEdits = useCallback((changes, record = true) => {
    if (!changes.length) return;
    const idx = derived.ridToIdx;
    changes.forEach((c) => {
      const i = idx.get(c.rid);
      if (i === undefined) return;
      rowsRef.current[i] = { ...rowsRef.current[i], [c.field]: c.after };
      issuesRef.current.delete(c.rid);
      dbDupRef.current.delete(c.rid);
    });
    if (record) {
      undoRef.current = [...undoRef.current.slice(-(MAX_HISTORY - 1)), { type: 'edit', changes }];
      redoRef.current = [];
    }
    bump();
    chunks(changes, PATCH_BATCH).forEach((batch) =>
      persist('/cells', { changes: batch.map((c) => ({ rid: c.rid, field: c.field, value: c.after })) }));
    scheduleValidate();
  }, [derived, bump, persist, scheduleValidate]);

  const deleteRids = useCallback((rids, record = true) => {
    if (!rids.length) return;
    const set = new Set(rids);
    const removed = rowsRef.current.filter((r) => set.has(r._rid));
    rowsRef.current = rowsRef.current.filter((r) => !set.has(r._rid));
    rids.forEach((rid) => { issuesRef.current.delete(rid); dbDupRef.current.delete(rid); });
    dupDetailsRef.current = dupDetailsRef.current.filter((d) => !set.has(d.rid));
    if (record) {
      undoRef.current = [...undoRef.current.slice(-(MAX_HISTORY - 1)), { type: 'delete', rows: removed }];
      redoRef.current = [];
    }
    bump();
    chunks(rids, 20000).forEach((batch) => persist('/rows/delete', { rids: batch }));
  }, [bump, persist]);

  const restoreRows = useCallback((rows) => {
    rowsRef.current = [...rowsRef.current, ...rows].sort((a, b) => a._rid - b._rid);
    bump();
    chunks(rows, 20000).forEach((batch) => persist('/rows/restore', { rows: batch }));
    scheduleValidate();
  }, [bump, persist, scheduleValidate]);

  const undo = useCallback(() => {
    const op = undoRef.current.pop();
    if (!op) return showNotice('Nothing to undo');
    if (op.type === 'edit') {
      applyEdits(op.changes.map((c) => ({ ...c, before: c.after, after: c.before })), false);
    } else {
      restoreRows(op.rows);
    }
    redoRef.current.push(op);
    return showNotice('↺ Undone');
  }, [applyEdits, restoreRows, showNotice]);

  const redo = useCallback(() => {
    const op = redoRef.current.pop();
    if (!op) return showNotice('Nothing to redo');
    if (op.type === 'edit') applyEdits(op.changes, false);
    else deleteRids(op.rows.map((r) => r._rid), false);
    undoRef.current.push(op);
    return showNotice('↻ Redone');
  }, [applyEdits, deleteRids, showNotice]);

  useEffect(() => {
    const onKey = (e) => {
      if (editing || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, undo, redo]);

  // ── Cell editing ───────────────────────────────────────────────────────────────
  const broadcastFocus = useCallback(async (rid, field) => {
    try {
      const res = await api(`/drafts/${id}/presence`, { method: 'POST', body: rid === null ? {} : { rid, field } });
      setPresence(res.presence || []);
    } catch { /* ignore */ }
  }, [id]);

  const startEdit = (rid, field) => {
    const i = derived.ridToIdx.get(rid);
    if (i === undefined) return;
    setEditing({ rid, field, value: rowsRef.current[i][field] ?? '' });
    broadcastFocus(rid, field);
  };

  const finishEdit = (move) => {
    if (!editing) return;
    const { rid, field, value } = editing;
    const i = derived.ridToIdx.get(rid);
    const before = i !== undefined ? rowsRef.current[i][field] ?? '' : '';
    const after = String(value).trim();
    if (i !== undefined && after !== before) applyEdits([{ rid, field, before, after }]);

    if (!move) {
      setEditing(null);
      broadcastFocus(null);
      return;
    }
    const pos = filtered.indexOf(i);
    let nextPos = pos;
    let nextField = field;
    if (move === 'down') nextPos = pos + 1;
    if (move === 'right' || move === 'left') {
      let f = FIELDS.indexOf(field) + (move === 'right' ? 1 : -1);
      if (f >= FIELDS.length) { f = 0; nextPos = pos + 1; }
      if (f < 0) { f = FIELDS.length - 1; nextPos = pos - 1; }
      nextField = FIELDS[f];
    }
    const nextIdx = filtered[nextPos];
    if (nextIdx === undefined || nextPos < pageStart || nextPos >= pageStart + pageSize) {
      setEditing(null);
      broadcastFocus(null);
      return;
    }
    startEdit(rowsRef.current[nextIdx]._rid, nextField);
    const el = scrollRef.current;
    const offset = (nextPos - pageStart) * ROW_HEIGHT;
    if (el && (offset < el.scrollTop || offset > el.scrollTop + el.clientHeight - ROW_HEIGHT * 2)) {
      el.scrollTop = Math.max(0, offset - el.clientHeight / 2);
    }
  };

  // ── Navigation helpers ─────────────────────────────────────────────────────────
  const chooseFilter = (f) => {
    setFilter(f);
    setPage(1);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const goPage = (p) => {
    setPage(Math.max(1, Math.min(totalPages, p)));
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const jumpTo = (rid, field = 'account_number') => {
    setPopover(null);
    setInspector(false);
    const idx = derived.ridToIdx.get(rid);
    if (idx === undefined) return toast.error('That row no longer exists.');
    let pos = filtered.indexOf(idx);
    if (pos === -1) {
      setFilter('all');
      pos = idx;
    }
    setPage(Math.floor(pos / pageSize) + 1);
    pendingScroll.current = Math.max(0, (pos % pageSize) * ROW_HEIGHT - 160);
    setFlash({ rid, field });
    setTimeout(() => setFlash(null), 2500);
    return undefined;
  };

  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = pendingScroll.current;
      setScrollTop(pendingScroll.current);
      pendingScroll.current = null;
    }
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => setViewportH(el.clientHeight || 580);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [loading]);

  // ── Bulk actions ───────────────────────────────────────────────────────────────
  const leaveOne = (idx) => {
    const copies = derived.info[idx]?.copies || [];
    if (!copies.length) return;
    deleteRids(copies.map((c) => rowsRef.current[c]._rid));
    setDupRid(null);
    showNotice(`✓ Kept row #${idx + 1}; removed ${copies.length} duplicate cop${copies.length === 1 ? 'y' : 'ies'}`);
  };

  const removeRow = (idx) => {
    const r = rowsRef.current[idx];
    if (r) deleteRids([r._rid]);
    setDupRid(null);
  };

  const bulkLeaveOne = () => {
    const rids = [];
    derived.groups.forEach((g) => { if (g.length > 1) g.slice(1).forEach((i) => rids.push(rowsRef.current[i]._rid)); });
    setConfirm({
      title: 'Leave 1 per duplicate group',
      message: `Keep 1 record for each duplicate group and remove all ${rids.length.toLocaleString()} duplicate copy row(s) from this file?`,
      action: () => { deleteRids(rids); showNotice(`✓ Removed ${rids.length.toLocaleString()} duplicate copies`); },
    });
  };

  const bulkDeleteDb = () => {
    const rids = rowsRef.current.filter((_, i) => derived.info[i].db).map((r) => r._rid);
    setConfirm({
      title: 'Delete database duplicates',
      message: `Delete all ${rids.length.toLocaleString()} row(s) that already exist in the database?`,
      action: () => { deleteRids(rids); showNotice(`✓ Deleted ${rids.length.toLocaleString()} database duplicate rows`); },
    });
  };

  const autoFixDates = () => {
    const changes = [];
    rowsRef.current.forEach((r) => {
      const fixed = flexDate(r.compilation_date);
      if (fixed && fixed !== r.compilation_date) changes.push({ rid: r._rid, field: 'compilation_date', before: r.compilation_date, after: fixed });
    });
    if (!changes.length) return toast.info('All compilation dates are already in YYYY-MM-DD format.');
    applyEdits(changes);
    return toast.success(`Fixed ${changes.length.toLocaleString()} compilation date(s) to YYYY-MM-DD.`);
  };

  // ── Exports ────────────────────────────────────────────────────────────────────
  const writeSheet = (rows, sheetName, fileName) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
  };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD in EAT

  const exportDraft = () => {
    if (!rowsRef.current.length) return;
    writeSheet(rowsRef.current.map((r) => Object.fromEntries(FIELDS.map((f) => [LABELS[f], r[f]]))), 'Draft', `UFAA_Draft_${today}.xlsx`);
  };

  const exportFiltered = () => {
    if (!filtered.length) return toast.error('No rows match the current filter to export.');
    const label = { all: 'All', clean: 'Clean', critical: 'Errors', warnings: 'Warnings', duplicates: 'Duplicates' }[filter];
    const out = filtered.map((i) => {
      const r = rowsRef.current[i];
      const x = derived.info[i];
      const row = { 'Row #': i + 1, ...Object.fromEntries(FIELDS.map((f) => [LABELS[f], r[f]])) };
      if (filter === 'critical' || filter === 'warnings') {
        const src = filter === 'critical' ? x.errors : x.warnings;
        row.Issues = Object.entries(src).map(([f, m]) => `[${f}] ${m}`).join(' | ');
      }
      if (filter === 'duplicates') {
        if (x.db) {
          row['Duplicate Type'] = 'Found in Database';
          row['Matched With'] = `DB Record #${x.db.db_id} (${x.db.db_owner_name || ''})`;
          Object.entries(x.db.db_record || {}).forEach(([f, v]) => { row[`[ORIGINAL] ${LABELS[f]}`] = v ?? ''; });
          row['[ORIGINAL] Uploaded / Source'] = x.db.created_at;
        } else if (x.copies.length) {
          row['Duplicate Type'] = 'Found on Same File';
          row['Matched With'] = `${x.copies.length} other row(s) in sheet (Rows: ${x.copies.map((c) => `#${c + 1}`).join(', ')})`;
        }
      }
      return row;
    });
    writeSheet(out, label, `UFAA_${label}_${today}.xlsx`);
    return undefined;
  };

  // ── Submit & lock ──────────────────────────────────────────────────────────────
  const commit = async () => {
    setConfirm(null);
    setEditing(null);
    setCommitting(true);
    stoppedRef.current = true;
    try {
      const res = await api(`/drafts/${id}/commit`, { method: 'POST' });
      setCommitResult(res);
    } catch (err) {
      stoppedRef.current = false;
      toast.error(`Error: ${err.message}`);
    } finally {
      setCommitting(false);
    }
  };

  const downloadLocked = async () => {
    try {
      await downloadFile(`/submissions/${commitResult.file_name}`, {}, commitResult.file_name);
    } catch (err) {
      toast.error(err.message);
    }
    setTimeout(() => navigate('/upload'), 1200);
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex justify-center py-24 text-slate-400"><Spinner className="h-8 w-8" /></div>;
  }

  const { counts, info } = derived;
  const isOwner = meta?.is_owner;
  const pendingIssues = counts.critical;
  const isReview = !!meta?.is_review;
  const submitLabel = !isOwner
    ? `Read-Only (Draft Owner: ${meta?.created_by || 'Officer'})`
    : isReview
      ? 'Submit Review (Update Database)'
      : counts.total === 0
      ? 'Upload & Lock File (No Records)'
      : pendingIssues > 0
        ? `Upload & Lock File (${pendingIssues.toLocaleString()} Issues Bypassed)`
        : counts.warnings > 0
          ? `Upload & Lock File (${counts.warnings.toLocaleString()} Warning${counts.warnings === 1 ? '' : 's'})`
          : 'Upload & Lock File';
  const sortedViewers = [...viewers].sort((a, b) => String(a.user).localeCompare(String(b.user)));
  const dupIdx = dupRid !== null ? derived.ridToIdx.get(dupRid) : undefined;
  const dupInfo = dupIdx !== undefined ? info[dupIdx] : null;

  const cellStyle = (x, f) => {
    if (x.errors[f]) return 'bg-red-50 font-bold text-red-800 ring-1 ring-inset ring-red-400';
    if (x.warnings[f]) return 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-400';
    return '';
  };
  const cellTitle = (x, f) => (x.errors[f] ? `Error: ${x.errors[f]}` : x.warnings[f] ? `Warning: ${x.warnings[f]}` : 'Click to edit cell');

  const visible = [];
  for (let p = winStart; p < winEnd; p++) visible.push(filtered[pageStart + p]);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/upload" className="mb-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-airtel">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to working files
          </Link>
          <h2 className="truncate text-xl font-extrabold text-slate-900">{meta?.draft_name || 'Draft'}</h2>
          <p className="text-xs text-slate-500">
            Owner: <b>{meta?.created_by}</b> · Last edit by <b>{meta?.last_edited_by}</b>
            {meta?.updated_at && <> · {fmtDateTime(meta.updated_at)}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center pl-1.5">
            {sortedViewers.map((v) => {
              const editingInfo = presence.find((p) => p.user === v.user);
              return (
                <Avatar key={v.user} name={v.user} color={v.color} title={v.user + (v.is_self ? ' (You)' : '')}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPopover({ ...v, rid: editingInfo?.rid, field: editingInfo?.field, x: rect.left, y: rect.bottom + 6 });
                  }} />
              );
            })}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
            {validating ? <><Spinner className="h-3 w-3" /> Checking duplicates in DB…</> : notice || 'Live Validation Active'}
          </span>
        </div>
      </div>

      {meta?.draft_status === 'flagged' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-6 w-6 text-amber-600" />
            <div>
              <div className="font-extrabold text-amber-900">Admin Flagged Duplicate Review Notice</div>
              <div className="text-sm text-amber-700">{meta.flagged_reason || 'An administrator flagged potential duplicate claims in this report. Edit cells directly in the grid below to resolve.'}</div>
            </div>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700"><PenSquare className="mr-1 inline h-3 w-3" /> Direct Web-Grid Edit Active</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard id="all" label="Total Rows" value={counts.total} icon={Layers} tone="text-slate-800" active={filter === 'all'} onClick={chooseFilter} />
        <SummaryCard id="clean" label="Clean" value={counts.clean} icon={CheckCircle2} tone="text-green-600" active={filter === 'clean'} onClick={chooseFilter} />
        <SummaryCard id="critical" label="Critical Errors" value={counts.critical} icon={CircleAlert} tone="text-red-600" active={filter === 'critical'} onClick={chooseFilter} />
        <SummaryCard id="warnings" label="Warnings" value={counts.warnings} icon={TriangleAlert} tone="text-amber-600" active={filter === 'warnings'} onClick={chooseFilter} />
        <SummaryCard id="duplicates" label="Duplicates" value={counts.duplicates} icon={Copy} tone="text-indigo-600" active={filter === 'duplicates'} onClick={chooseFilter} />
      </div>

      {/* Toolbar */}
      <div className="card mb-3 flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-outline btn-sm" onClick={undo} title="Undo (Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
          <button className="btn-outline btn-sm" onClick={redo} title="Redo (Ctrl+Y)"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
          <button className="btn-outline btn-sm" onClick={autoFixDates}><CalendarCheck className="h-3.5 w-3.5" /> Auto-Fix Compilation Dates</button>
          <button className="btn-outline btn-sm" onClick={() => setInspector(true)}><Copy className="h-3.5 w-3.5 text-indigo-600" /> Duplicate Inspector</button>
          <button className="btn-outline btn-sm" onClick={exportDraft}><Download className="h-3.5 w-3.5" /> Export Draft</button>
          <button className="btn-outline btn-sm" onClick={exportFiltered}><Filter className="h-3.5 w-3.5" /> Export {filter === 'all' ? 'All' : FILTERS[filter].replace('Filtered: ', '').replace(' Only', '')}</button>
        </div>
        <button
          className={isOwner && counts.total > 0 ? 'btn-success' : 'btn bg-slate-400 text-white'}
          disabled={!isOwner || counts.total === 0}
          title={isOwner ? 'Upload and lock this file. Data will be inserted into the database.' : 'Only the draft creator can submit and lock this file.'}
          onClick={() => setConfirm({
            title: isReview ? 'Submit Duplicate Review' : 'Upload & Lock File',
            message: isReview
              ? `The ${counts.total.toLocaleString()} row(s) left in this file will update their database records. Copies you removed will be deleted from the database, unless a letter or claim already exists for them. Nothing new is added. This cannot be undone.`
              : `Import ${counts.total.toLocaleString()} record(s) into the database and lock this working file?`
                + (counts.dbDup ? ` WARNING: ${counts.dbDup.toLocaleString()} row(s) already exist in the database and will be added again as duplicates — use "Delete All Database Matches" under the Duplicates card first.` : '')
                + (pendingIssues - counts.dbDup > 0 ? ` ${(pendingIssues - counts.dbDup).toLocaleString()} other row(s) still have critical issues and will be imported as they are.` : '')
                + ' This cannot be undone.',
            action: commit,
          })}
        >
          {isOwner ? <CloudUpload className="h-4 w-4" /> : <Lock className="h-4 w-4" />} {submitLabel}
        </button>
      </div>

      {filter === 'duplicates' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <span className="mr-2 text-sm font-bold text-red-800">Bulk duplicate actions:</span>
          <button className="btn-outline btn-sm border-red-300 text-red-700" disabled={!counts.inFileExtra} onClick={bulkLeaveOne}>
            <Copy className="h-3.5 w-3.5" /> Leave 1 for All In-File Groups
            <span className="rounded-full bg-red-600 px-2 text-white">{counts.inFileExtra.toLocaleString()}</span>
          </button>
          <button className="btn-outline btn-sm border-red-300 text-red-700" disabled={!counts.dbDup} onClick={bulkDeleteDb}>
            <Database className="h-3.5 w-3.5" /> Delete All Database Matches
            <span className="rounded-full bg-red-600 px-2 text-white">{counts.dbDup.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs">
          <span className="font-bold text-blue-700">{FILTERS[filter]}</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">
              Showing {filtered.length ? (pageStart + 1).toLocaleString() : 0} – {(pageStart + pageCount).toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
            <select className="input w-auto py-1 text-xs" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); goPage(1); }}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s.toLocaleString()} / page</option>)}
            </select>
            <button className="btn-outline btn-sm" disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)}>Prev</button>
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-extrabold text-blue-700">Page {currentPage} / {totalPages}</span>
            <button className="btn-outline btn-sm" disabled={currentPage >= totalPages} onClick={() => goPage(currentPage + 1)}>Next</button>
          </div>
        </div>

        <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="relative max-h-[580px] overflow-auto">
          <table className="w-full border-collapse text-[0.84rem]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-ink text-[#e5e7eb]">
                <th className="w-16 px-2 py-2.5 text-center text-xs">#</th>
                {FIELDS.map((f) => (
                  <th key={f} className={`${COL_WIDTH[f]} border-l border-white/10 px-3 py-2.5 text-left text-xs font-bold ${f === 'due_amount' ? 'text-right' : ''}`}>
                    {LABELS[f]}{['owner_name', 'account_number', 'due_amount', 'compilation_date'].includes(f) ? ' *' : ''}
                  </th>
                ))}
                <th className="w-20 px-2 py-2.5 text-center text-xs">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageCount === 0 ? (
                <tr><td colSpan={FIELDS.length + 2}><EmptyState icon={Filter}>No records found matching filter &quot;{filter}&quot;.</EmptyState></td></tr>
              ) : (
                <>
                  {winStart > 0 && <tr style={{ height: winStart * ROW_HEIGHT }}><td colSpan={FIELDS.length + 2} /></tr>}
                  {visible.map((idx, n) => {
                    const r = rowsRef.current[idx];
                    const x = info[idx];
                    if (!r || !x) return null;
                    return (
                      <tr key={r._rid} style={{ height: ROW_HEIGHT }} className={x.hasCrit ? 'bg-red-50/40' : (winStart + n) % 2 ? 'bg-slate-50' : 'bg-surface'}>
                        <td className="whitespace-nowrap border-r border-slate-100 px-2 text-center text-xs font-bold text-slate-400">
                          {idx + 1}
                          {x.isDup && (
                            <button onClick={() => setDupRid(r._rid)} className="ml-1 rounded border border-red-300 bg-surface px-1 text-red-600" title="Show duplicate details">
                              <ChevronDown className="inline h-3 w-3" />
                            </button>
                          )}
                        </td>
                        {FIELDS.map((f) => {
                          const isEditing = editing && editing.rid === r._rid && editing.field === f;
                          const p = presenceMap.get(`${r._rid}:${f}`);
                          const flashing = flash && flash.rid === r._rid && flash.field === f;
                          return (
                            <td
                              key={f}
                              onClick={() => !isEditing && startEdit(r._rid, f)}
                              title={p ? `${p.user} is editing this cell` : cellTitle(x, f)}
                              className={`relative max-w-[260px] cursor-text truncate border-r border-slate-100 px-3 ${f === 'due_amount' ? 'text-right font-semibold' : ''} ${f === 'account_number' ? 'font-semibold' : ''} ${cellStyle(x, f)} ${flashing ? 'jump-highlight' : ''}`}
                              style={p ? { boxShadow: `inset 0 0 0 2px ${p.color}` } : undefined}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  className="absolute inset-0 h-full w-full border-2 border-blue-600 bg-surface px-2.5 text-[0.84rem] font-normal text-slate-900 outline-none"
                                  value={editing.value}
                                  onChange={(e) => setEditing((ed) => ({ ...ed, value: e.target.value }))}
                                  onBlur={() => {
                                    const cur = editingRef.current;
                                    if (cur && cur.rid === r._rid && cur.field === f) finishEdit(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); finishEdit('down'); }
                                    else if (e.key === 'Tab') { e.preventDefault(); finishEdit(e.shiftKey ? 'left' : 'right'); }
                                    else if (e.key === 'Escape') { setEditing(null); broadcastFocus(null); }
                                  }}
                                />
                              ) : r[f] ? (
                                r[f]
                              ) : x.errors[f] || x.warnings[f] ? (
                                <span className="italic opacity-60">(missing)</span>
                              ) : null}
                              {p && !isEditing && (
                                <span className="absolute -top-0 right-0 rounded-bl px-1 text-[0.6rem] font-extrabold text-white" style={{ background: p.color }}>
                                  {p.initials}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 text-center">
                          {x.copies.length > 0 && !x.db ? (
                            <button onClick={() => leaveOne(idx)} className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-[0.7rem] font-bold text-red-700 hover:bg-red-200" title="Keep this row and remove the other duplicate copies">
                              Leave 1
                            </button>
                          ) : (
                            <button onClick={() => removeRow(idx)} className="rounded p-1 text-red-500 hover:bg-red-50" title={x.db ? 'Delete this database-duplicate row' : 'Delete this row'}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {winEnd < pageCount && <tr style={{ height: (pageCount - winEnd) * ROW_HEIGHT }}><td colSpan={FIELDS.length + 2} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>Click a cell to edit · Enter moves down · Tab moves right · Ctrl+Z / Ctrl+Y undo &amp; redo</span>
          <span>Fast virtual scrolling active</span>
        </div>
      </div>

      {/* Officer popover */}
      {popover && (
        <div className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-surface p-3 shadow-xl"
          style={{ top: popover.y, left: Math.max(10, Math.min(popover.x - 90, window.innerWidth - 270)) }}>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: popover.color }}>{initials(popover.user)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold text-slate-900">{popover.user}{popover.is_self ? ' (You)' : ''}</div>
              <div className="text-xs text-slate-500">
                {popover.rid !== undefined && popover.field
                  ? <span className="font-bold text-green-700"><PenSquare className="mr-1 inline h-3 w-3" />Editing row #{(derived.ridToIdx.get(popover.rid) ?? 0) + 1} ({LABELS[popover.field]})</span>
                  : <span className="text-sky-700"><Eye className="mr-1 inline h-3 w-3" />Currently viewing file</span>}
              </div>
            </div>
            <button onClick={() => setPopover(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
          {popover.rid !== undefined && popover.field && (
            <button className="btn-primary btn-sm w-full" onClick={() => jumpTo(popover.rid, popover.field)}>
              <Crosshair className="h-3.5 w-3.5" /> Go to Location
            </button>
          )}
        </div>
      )}

      {/* Duplicate details for one row */}
      <Modal open={!!dupInfo} onClose={() => setDupRid(null)} wide
        title={dupInfo?.db ? `Row #${dupIdx + 1} — Found in Database` : `Row #${(dupIdx ?? 0) + 1} — Found on Same File`}
        icon={dupInfo?.db ? <Database className="h-5 w-5 text-red-600" /> : <Copy className="h-5 w-5 text-red-600" />}
        footer={dupInfo && (
          <>
            <button className="btn-outline" onClick={() => setDupRid(null)}>Close</button>
            {dupInfo.copies.length > 0 && !dupInfo.db && (
              <button className="btn-primary" onClick={() => leaveOne(dupIdx)}>Keep row #{dupIdx + 1}, remove {dupInfo.copies.length} cop{dupInfo.copies.length === 1 ? 'y' : 'ies'}</button>
            )}
            {dupInfo.db && <button className="btn-primary" onClick={() => removeRow(dupIdx)}><Trash2 className="h-4 w-4" /> Delete this row</button>}
          </>
        )}>
        {dupInfo && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-red-50 text-left font-bold uppercase text-red-800">
                  <th className="border border-red-200 px-2 py-1.5">Source</th>
                  {FIELDS.map((f) => <th key={f} className="border border-red-200 px-2 py-1.5">{LABELS[f]}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-surface font-semibold">
                  <td className="border border-red-200 px-2 py-1.5 text-red-700">This row (#{dupIdx + 1})</td>
                  {FIELDS.map((f) => <td key={f} className="border border-red-200 px-2 py-1.5">{rowsRef.current[dupIdx]?.[f]}</td>)}
                </tr>
                {dupInfo.db ? (
                  <tr className="bg-red-50/60">
                    <td className="border border-red-200 px-2 py-1.5 font-bold text-red-700">
                      DB Record #{dupInfo.db.db_id}<div className="font-normal text-slate-500">Uploaded {dupInfo.db.created_at}</div>
                    </td>
                    {FIELDS.map((f) => <td key={f} className="border border-red-200 px-2 py-1.5">{dupInfo.db.db_record?.[f]}</td>)}
                  </tr>
                ) : dupInfo.copies.map((c) => (
                  <tr key={c} className="bg-red-50/60">
                    <td className="border border-red-200 px-2 py-1.5 font-bold text-red-700">
                      Row #{c + 1}
                      <button className="ml-2 text-blue-700 hover:underline" onClick={() => { setDupRid(null); jumpTo(rowsRef.current[c]._rid); }}>go to</button>
                    </td>
                    {FIELDS.map((f) => <td key={f} className="border border-red-200 px-2 py-1.5">{rowsRef.current[c]?.[f]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Duplicate inspector */}
      <Modal open={inspector} onClose={() => setInspector(false)} wide title="Duplicate Records Inspector" icon={<Copy className="h-5 w-5 text-indigo-600" />}
        footer={<button className="btn-outline" onClick={() => setInspector(false)}>Close Inspector</button>}>
        <DuplicateInspector derived={derived} rows={rowsRef.current} onJump={jumpTo} />
      </Modal>

      {/* Confirmation */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title}
        footer={<><button className="btn-outline" onClick={() => setConfirm(null)}>Cancel</button><button className="btn-primary" onClick={() => { const a = confirm.action; setConfirm(null); a(); }}>Confirm</button></>}>
        <p className="text-sm text-slate-600">{confirm?.message}</p>
      </Modal>

      {/* Blocking overlay during submit */}
      {committing && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md">
          <div className="max-w-md rounded-2xl bg-surface p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-green-600 bg-green-50 text-green-600"><Lock className="h-8 w-8 animate-bounce" /></div>
            <h3 className="text-xl font-extrabold text-slate-900">Submitting &amp; Locking File…</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">Importing sanitized compliance records into the database and generating the protected submission file.</p>
            <div className="mt-4 h-2.5 w-full animate-pulse rounded-full bg-gradient-to-r from-green-600 via-green-400 to-green-600" />
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
              <ShieldHalf className="h-4 w-4 shrink-0" /> Editing is locked while the upload finishes. Please do not refresh or close this tab.
            </div>
          </div>
        </div>
      )}

      {/* Success */}
      <Modal open={!!commitResult} locked title="Submission Complete!" icon={<CheckCircle2 className="h-6 w-6 text-green-600" />}
        footer={
          <>
            <button className="btn-outline" onClick={() => navigate('/upload')}>Close</button>
            {commitResult?.has_file && <button className="btn-primary" onClick={downloadLocked}><FileDown className="h-4 w-4" /> Download Locked Copy</button>}
          </>
        }>
        <p className="mb-4 text-sm text-slate-600">{commitResult?.message}</p>
        {commitResult?.has_file && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <div className="mb-2 flex items-center justify-between font-extrabold uppercase tracking-wide text-slate-600">
            <span><Lock className="mr-1 inline h-3.5 w-3.5 text-airtel" /> Sheet Protection Status</span>
            <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-green-700">Protected &amp; Locked</span>
          </div>
          The generated Excel file is protected against cell modifications. The unlock key is stored in the <b>Admin Vault</b>.
          Contact your Compliance Administrator if unlocking is required.
        </div>}
      </Modal>

      {/* Closed by someone else */}
      <Modal open={!!closedBy && !commitResult} locked title="File Submitted & Locked" icon={<Lock className="h-5 w-5 text-red-600" />}
        footer={<button className="btn-primary" onClick={() => navigate('/upload', { replace: true })}><ArrowLeft className="h-4 w-4" /> Return to Working Files</button>}>
        <p className="text-sm text-slate-600">
          This working file has just been submitted and locked by <b>{closedBy}</b>. This workspace is now closed for editing.
        </p>
      </Modal>
    </div>
  );
}

function DuplicateInspector({ derived, rows, onJump }) {
  const inFile = [];
  const db = [];
  derived.info.forEach((x, i) => {
    if (x.db) db.push(i);
    else if (x.copies.length) inFile.push(i);
  });
  if (!inFile.length && !db.length) {
    return (
      <div className="py-10 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <div className="font-bold text-slate-900">No Duplicate Conflicts Detected</div>
        <div className="text-sm text-slate-500">All records in this sheet are unique and clear of historical database matches.</div>
      </div>
    );
  }
  const section = (title, icon, list, extra) => (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between rounded-lg border-l-4 border-red-700 bg-red-100 px-3 py-2 text-sm font-extrabold text-red-800">
        <span className="flex items-center gap-2">{icon} {title} <span className="rounded-full bg-red-700 px-2 text-white">{list.length.toLocaleString()}</span></span>
        {list.length > 1000 && <span className="text-xs font-semibold">showing first 1,000</span>}
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border border-red-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-red-50 text-left font-bold uppercase text-red-800">
            <tr>
              <th className="px-2 py-1.5">Row</th>
              <th className="px-2 py-1.5">{extra.header}</th>
              {FIELDS.map((f) => <th key={f} className="px-2 py-1.5">{LABELS[f]}</th>)}
              <th className="px-2 py-1.5">Go To</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 1000).map((i) => (
              <tr key={rows[i]._rid} className="border-t border-red-100 odd:bg-surface even:bg-red-50/40">
                <td className="px-2 py-1.5 font-extrabold text-red-700">#{i + 1}</td>
                <td className="px-2 py-1.5 font-bold text-red-700">{extra.cell(i)}</td>
                {FIELDS.map((f) => <td key={f} className="whitespace-nowrap px-2 py-1.5">{rows[i][f]}</td>)}
                <td className="px-2 py-1.5">
                  <button className="rounded border border-red-300 p-1 text-red-700 hover:bg-red-100" onClick={() => onJump(rows[i]._rid)}><Crosshair className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <>
      {inFile.length > 0 && section('Found on Same File', <Copy className="h-4 w-4" />, inFile,
        { header: 'Matches', cell: (i) => derived.info[i].copies.slice(0, 3).map((c) => `#${c + 1}`).join(', ') })}
      {db.length > 0 && section('Found in Database', <Database className="h-4 w-4" />, db,
        { header: 'DB Record', cell: (i) => `#${derived.info[i].db.db_id}` })}
    </>
  );
}
