import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowRight, BarChart3 as ChartColumn, CheckCircle2, FileText, Gauge, History, Hourglass, PieChart as ChartPie, RotateCw,
  TrendingUp as ChartLine, UsersRound, Vault,
} from 'lucide-react';
import ActivityTable from '../../components/ActivityTable';
import { EmptyState, PageHeader, Spinner, StatCard, fitCharsFor } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { fmtMoney, fmtNumber } from '../../lib/format';

// Chart tooltip colours follow the light/dark theme.
const TOOLTIP = { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--slate-200))', borderRadius: 10, color: 'rgb(var(--slate-900))' };

function ChartCard({ icon: Icon, title, children }) {
  return (
    <div className="card min-w-0 p-5">
      <div className="card-title mb-4"><Icon className="h-5 w-5 text-airtel" /> {title}</div>
      <div className="h-72">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, logs] = await Promise.all([api('/admin/stats'), api('/admin/logs', { params: { per_page: 30 } })]);
      setStats(s);
      setRecent(logs.logs);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const pct = (part) => {
    if (!stats) return '';
    const total = stats.claimed_count + stats.unclaimed_count;
    return total ? `${((part / total) * 100).toFixed(1)}% of accounts` : '0% of accounts';
  };

  // One shared number size for the whole row of stat cards.
  const fit = fitCharsFor(stats ? [fmtNumber(stats.total), fmtMoney(stats.unclaimed), fmtMoney(stats.claimed), fmtNumber(stats.letters), fmtNumber(stats.users)] : ['—']);

  const pie = stats ? [
    { name: 'Claimed', value: stats.claimed_count, color: '#16a34a' },
    { name: 'Unclaimed', value: stats.unclaimed_count, color: '#CC0000' },
  ] : [];
  const uploads = stats ? stats.chart_uploads.labels.map((l, i) => ({ label: l, records: stats.chart_uploads.data[i] })) : [];
  const trend = stats ? stats.chart_trend.labels.map((l, i) => ({ label: l, actions: stats.chart_trend.data[i] })) : [];

  return (
    <div>
      <PageHeader
        icon={Gauge}
        title="Dashboard Overview"
        subtitle="Live snapshot of the UFAA Compliance Portal."
        actions={
          <>
            <span className="badge bg-green-100 text-green-700">● Live</span>
            <button className="btn-outline" onClick={load} disabled={loading}>
              {loading ? <Spinner /> : <RotateCw className="h-4 w-4" />} Refresh
            </button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard fitChars={fit} label="Total Accounts Submitted" value={stats ? fmtNumber(stats.total) : '—'} sub={stats && `${fmtNumber(stats.uploads)} upload batches`} icon={Vault} />
        <StatCard fitChars={fit} label="Unclaimed Amount" value={stats ? fmtMoney(stats.unclaimed) : '—'} sub={stats && pct(stats.unclaimed_count)} icon={Hourglass} tone="gold" />
        <StatCard fitChars={fit} label="Claimed Amount" value={stats ? fmtMoney(stats.claimed) : '—'} sub={stats && pct(stats.claimed_count)} icon={CheckCircle2} tone="green" />
        <StatCard fitChars={fit} label="Holder Letters Issued" value={stats ? fmtNumber(stats.letters) : '—'} icon={FileText} tone="sky" />
        <StatCard fitChars={fit} label="Active Admin Users" value={stats ? fmtNumber(stats.users) : '—'} sub={stats && `${fmtNumber(stats.today_activity)} actions today`} icon={UsersRound} tone="violet" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard icon={ChartPie} title="Claimed vs Unclaimed">
          {stats && (stats.claimed_count + stats.unclaimed_count) > 0 ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                  {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP} formatter={(v) => fmtNumber(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={ChartPie}>No claimed or unclaimed records yet.</EmptyState>}
        </ChartCard>

        <div className="card min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="card-title"><History className="h-5 w-5 text-airtel" /> Recent Activity</span>
            <Link to="/admin/logs" className="btn-outline btn-sm">View All <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <ActivityTable logs={recent} compact maxHeight="288px" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard icon={ChartColumn} title="Records Uploaded (Last 6 Months)">
          {uploads.length ? (
            <ResponsiveContainer>
              <BarChart data={uploads}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--slate-200))" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v) => fmtNumber(v)} />
                <Bar dataKey="records" fill="#CC0000" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={ChartColumn}>No uploads in the last 6 months.</EmptyState>}
        </ChartCard>
        <ChartCard icon={ChartLine} title="Activity Trend (Last 14 Days)">
          {trend.length ? (
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--slate-200))" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip contentStyle={TOOLTIP} />
                <Line type="monotone" dataKey="actions" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={ChartLine}>No activity in the last 14 days.</EmptyState>}
        </ChartCard>
      </div>
    </div>
  );
}
