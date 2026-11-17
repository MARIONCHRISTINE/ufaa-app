import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CalendarDays, FileSpreadsheet, FileText, RotateCcw, Table, Vault } from 'lucide-react';
import { EmptyState, FitValue, PageHeader, Spinner, fitCharsFor } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api, downloadFile } from '../../lib/api';
import { fmtMoney, fmtNumber } from '../../lib/format';

// Chart tooltip colours follow the light/dark theme.
const TOOLTIP = { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--slate-200))', borderRadius: 10, color: 'rgb(var(--slate-900))' };

const KEYS = ['year', 'date_from', 'date_to', 'status', 'letter'];
const STATUS_COLORS = { Claimed: '#16a34a', Unclaimed: '#CC0000', 'Letter Generated': '#0284c7', Submitted: '#7c3aed' };

function statusBadge(status) {
  const cls = status === 'Claimed' ? 'bg-green-100 text-green-700' : status === 'Unclaimed' ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700';
  return <span className={`badge ${cls}`}>{status === 'Letter Generated' ? 'Letter Issued' : status}</span>;
}

export default function Reports() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ''])));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const query = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    setData(null);
    try {
      const res = await api('/admin/reports', { params: JSON.parse(queryKey) });
      setData(res);
      setForm((f) => ({ ...f, date_from: f.date_from || res.date_from, date_to: f.date_to || res.date_to }));
    } catch (err) {
      toast.error(err.message);
    }
  }, [queryKey, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e) => {
    e?.preventDefault();
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };
  const onYear = (year) => {
    const next = { ...form, year, date_from: year ? `${year}-01-01` : '', date_to: year ? `${year}-12-31` : '' };
    setForm(next);
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };
  const reset = () => {
    setForm(Object.fromEntries(KEYS.map((k) => [k, ''])));
    setParams({});
  };

  const download = async (kind, path, fallback) => {
    setBusy(kind);
    try {
      await downloadFile(path, query, fallback);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const value = (status) => data?.status_totals.find((s) => s.status === status)?.sum_amount || 0;

  const chartMap = {};
  (data?.monthly || []).forEach((m) => {
    chartMap[m.month_key] = chartMap[m.month_key] || { label: m.month_label };
    chartMap[m.month_key][m.status] = m.record_count;
  });
  const chart = Object.keys(chartMap).sort().map((k) => chartMap[k]);
  const statuses = [...new Set((data?.monthly || []).map((m) => m.status))];

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Reports & Data Export"
        subtitle="Generate Airtel Money Kenya statutory compliance returns for filing with the Unclaimed Financial Assets Authority (UFAA)."
        actions={
          <>
            <button className="btn-outline border-red-200 text-airtel" disabled={!!busy} onClick={() => download('pdf', '/admin/reports/pdf', 'UFAA_Executive_Report.pdf')}>
              {busy === 'pdf' ? <Spinner /> : <FileText className="h-4 w-4" />} Executive PDF Report
            </button>
            <button className="btn-primary" disabled={!!busy} onClick={() => download('summary', '/admin/reports/summary-csv', 'UFAA_Executive_Report.csv')}>
              {busy === 'summary' ? <Spinner /> : <FileSpreadsheet className="h-4 w-4" />} Executive Excel Report
            </button>
            <button className="btn-outline" disabled={!!busy} onClick={() => download('raw', '/admin/reports/raw-csv', 'UFAA_Raw_Data.csv')}>
              {busy === 'raw' ? <Spinner /> : <Table className="h-4 w-4" />} Export Raw CSV Data
            </button>
          </>
        }
      />

      <form onSubmit={apply} className="card mb-6 p-5">
        <div className="card-title mb-4"><CalendarDays className="h-5 w-5 text-airtel" /> Select Report Filter &amp; Multi-Year Range</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Quick Year Filter</label>
            <select className="input" value={form.year} onChange={(e) => onYear(e.target.value)}>
              <option value="">All Time</option>
              {(data?.available_years || []).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div><label className="label">Date From</label><input type="date" className="input" value={form.date_from} onChange={set('date_from')} /></div>
          <div><label className="label">Date To</label><input type="date" className="input" value={form.date_to} onChange={set('date_to')} /></div>
          <div>
            <label className="label">Claim Status</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="">All Statuses</option>
              <option value="Unclaimed">Unclaimed</option>
              <option value="Letter Generated">Letter Issued</option>
              <option value="Submitted">Submitted</option>
              <option value="Claimed">Claimed</option>
            </select>
          </div>
          <div>
            <label className="label">Letter Status</label>
            <select className="input" value={form.letter} onChange={set('letter')}>
              <option value="">All Letters</option>
              <option value="Yes">Letter Issued (Yes)</option>
              <option value="No">No Letter Issued (No)</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <span className="text-sm text-slate-500">
            {data && <>Filtering records from <b>{data.date_from}</b> to <b>{data.date_to}</b></>}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset Filters</button>
            <button type="submit" className="btn-primary"><BarChart3 className="h-4 w-4" /> Generate Report</button>
          </div>
        </div>
      </form>

      {data === null ? (
        <div className="flex justify-center py-16 text-slate-400"><Spinner className="h-8 w-8" /></div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Total Accounts', fmtNumber(data.total_records), 'border-l-navy text-heading'],
              ['Total Asset Value', fmtMoney(data.total_value, 'KSh'), 'border-l-airtel text-airtel'],
              ['Claimed Value', fmtMoney(value('Claimed'), 'KSh'), 'border-l-green-600 text-green-600'],
              ['Unclaimed Value', fmtMoney(value('Unclaimed'), 'KSh'), 'border-l-orange-600 text-orange-600'],
            ].map(([label, v, cls]) => (
              <div key={label} className={`card flex min-w-0 flex-col gap-1.5 border-l-4 px-5 py-4 ${cls}`}>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                <FitValue value={v} max="1.5rem" reserveCurrency fitChars={fitCharsFor([fmtNumber(data.total_records), fmtMoney(data.total_value, 'KSh'), fmtMoney(value('Claimed'), 'KSh'), fmtMoney(value('Unclaimed'), 'KSh')])} />
              </div>
            ))}
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="card min-w-0 p-5">
              <div className="mb-1 card-title"><Vault className="h-5 w-5 text-airtel" /> Money Totals by Claim Status</div>
              <p className="mb-4 text-xs text-slate-500">Total money in Kenya Shillings (KSh) by status for the selected range.</p>
              {data.status_totals.length === 0 ? <EmptyState>No records found in selected range.</EmptyState> : (
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="py-2">Status</th><th className="py-2 text-right">Accounts</th><th className="py-2 text-right">Total Money</th><th className="py-2 text-right">% Share</th></tr></thead>
                  <tbody>
                    {data.status_totals.map((s) => (
                      <tr key={s.status} className="border-b border-slate-100">
                        <td className="py-2">{statusBadge(s.status)}</td>
                        <td className="py-2 text-right font-semibold">{fmtNumber(s.cnt)}</td>
                        <td className="py-2 text-right font-bold">{fmtMoney(s.sum_amount, 'KSh')}</td>
                        <td className="py-2 text-right text-slate-500">{data.total_value ? ((s.sum_amount / data.total_value) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold"><td className="py-2">Total in Selected Range</td><td className="py-2 text-right">{fmtNumber(data.total_records)}</td><td className="py-2 text-right text-airtel">{fmtMoney(data.total_value, 'KSh')}</td><td className="py-2 text-right">100%</td></tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="card min-w-0 p-5">
              <div className="mb-1 card-title"><BarChart3 className="h-5 w-5 text-airtel" /> Monthly Asset Trends</div>
              <p className="mb-4 text-xs text-slate-500">Accounts compiled per month across the selected years.</p>
              <div className="h-72">
                {chart.length ? (
                  <ResponsiveContainer>
                    <BarChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--slate-200))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={TOOLTIP} formatter={(v) => fmtNumber(v)} />
                      <Legend />
                      {statuses.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s] || '#64748b'} />)}
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState>No data for the selected filters.</EmptyState>}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-extrabold text-slate-900">Monthly Asset Breakdown Table</span>
              <span className="text-xs text-slate-400">{data.monthly.length} month-status categories</span>
            </div>
            {data.monthly.length === 0 ? <EmptyState>No data available for selected filters.</EmptyState> : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="table-head sticky top-0"><tr><th>Month &amp; Year</th><th>Claim Status</th><th className="text-right">Total Accounts</th><th className="text-right">Total Money</th><th className="text-right">Average per Account</th></tr></thead>
                  <tbody className="table-body">
                    {data.monthly.map((m) => (
                      <tr key={`${m.month_key}-${m.status}`}>
                        <td className="font-bold">{m.month_label}</td>
                        <td>{statusBadge(m.status)}</td>
                        <td className="text-right font-semibold">{fmtNumber(m.record_count)}</td>
                        <td className="text-right font-bold">{fmtMoney(m.total_amount, 'KSh')}</td>
                        <td className="text-right text-slate-500">{fmtMoney(m.record_count ? m.total_amount / m.record_count : 0, 'KSh')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
