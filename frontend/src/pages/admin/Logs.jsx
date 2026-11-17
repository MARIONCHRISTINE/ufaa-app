import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, ListChecks, RotateCcw, Search } from 'lucide-react';
import ActivityTable from '../../components/ActivityTable';
import { PageHeader, Pagination } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { actionLabel } from '../../lib/format';

const KEYS = ['search', 'action_filter', 'user_filter', 'date_from', 'date_to'];

export default function Logs() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ''])));
  const [data, setData] = useState(null);
  const page = Number(params.get('page') || 1);
  const query = JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ''])));

  const load = useCallback(async () => {
    try {
      setData(await api('/admin/logs', { params: { ...JSON.parse(query), page, per_page: 100 } }));
    } catch (err) {
      toast.error(err.message);
    }
  }, [query, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };
  const reset = () => {
    setForm(Object.fromEntries(KEYS.map((k) => [k, ''])));
    setParams({});
  };
  const goPage = (p) => setParams({ ...Object.fromEntries(params.entries()), page: String(p) });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader icon={ListChecks} title="Activity Logs" subtitle="Audit trail of every sign-in, upload, export, status change and admin action." />
      <div className="card p-6">
        <form onSubmit={apply} className="filters-panel mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder="User, description, IP or record #" value={form.search} onChange={set('search')} />
            </div>
          </div>
          <div>
            <label className="label">Action</label>
            <select className="input" value={form.action_filter} onChange={set('action_filter')}>
              <option value="">All actions</option>
              {(data?.action_list || []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">User</label>
            <select className="input" value={form.user_filter} onChange={set('user_filter')}>
              <option value="">All users</option>
              {(data?.user_list || []).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className="label">From</label><input type="date" className="input" value={form.date_from} onChange={set('date_from')} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={form.date_to} onChange={set('date_to')} /></div>
          <div className="flex gap-2 lg:col-span-6">
            <button className="btn-primary" type="submit"><Filter className="h-4 w-4" /> Apply</button>
            <button className="btn-outline" type="button" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</button>
          </div>
        </form>
        <ActivityTable logs={data ? data.logs : null} maxHeight="max(340px, calc(100vh - 430px))" />
        {data && <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onChange={goPage} unit="entries" />}
      </div>
    </div>
  );
}
