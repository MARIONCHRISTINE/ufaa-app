import { useEffect, useState } from 'react';
import { Info, Save, Settings2, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';

function Row({ label, help, children, last }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 py-4 ${last ? '' : 'border-b border-slate-100'}`}>
      <div className="min-w-[200px] flex-1">
        <div className="text-sm font-bold text-slate-800">{label}</div>
        <p className="text-xs text-slate-500">{help}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [system, setSystem] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/admin/settings')
      .then((res) => { setS(res.settings); setSystem(res.system); })
      .catch((e) => toast.error(e.message));
  }, [toast]);

  if (!s) return <div className="flex justify-center py-16 text-slate-400"><Spinner className="h-8 w-8" /></div>;

  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api('/admin/settings', { method: 'PUT', body: s });
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      <PageHeader icon={SlidersHorizontal} title="System Settings" subtitle="Configure portal options, session security, and schedule system maintenance notifications." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="card px-5 pb-1 pt-5">
          <div className="card-title"><Settings2 className="h-5 w-5 text-airtel" /> General &amp; Security</div>
          <Row label="Portal Label" help="Displayed in the browser tab and page header.">
            <input className="input w-56" value={s.portal_label || ''} onChange={set('portal_label')} />
          </Row>
          <Row label="Session Timeout (minutes)" help="Auto-logout idle users after this duration of inactivity.">
            <input type="number" min={5} max={480} className="input w-24" value={s.session_timeout || ''} onChange={set('session_timeout')} />
          </Row>
          <Row label="Max Failed Login Attempts" help="Auto-lock an account after this many consecutive failed logins. An administrator must reactivate it." last>
            <input type="number" min={1} max={50} className="input w-24" value={s.max_login_attempts || ''} onChange={set('max_login_attempts')} />
          </Row>
        </div>

        <div className="card px-5 pb-1 pt-5">
          <div className="card-title"><TriangleAlert className="h-5 w-5 text-airtel" /> System Maintenance Scheduling</div>
          <Row label="Maintenance Status" help="Whether the system is operational, scheduled for maintenance, or under maintenance now.">
            <select className="input w-56" value={s.maintenance_mode || '0'} onChange={set('maintenance_mode')}>
              <option value="0">Off (Normal Operation)</option>
              <option value="scheduled">Scheduled Maintenance</option>
              <option value="1">Active Now (Under Maintenance)</option>
            </select>
          </Row>
          {s.maintenance_mode === 'scheduled' && (
            <Row label="Scheduled Date & Time" help="When maintenance is planned to take place.">
              <input type="datetime-local" className="input w-56" value={s.maintenance_scheduled_at || ''} onChange={set('maintenance_scheduled_at')} />
            </Row>
          )}
          <div className="border-b border-slate-100 py-4">
            <div className="text-sm font-bold text-slate-800">Notification Banner Message</div>
            <p className="mb-2 text-xs text-slate-500">Shown on the officer home page when maintenance is active or scheduled.</p>
            <textarea className="input h-28 resize-y" value={s.maintenance_banner_msg || ''} onChange={set('maintenance_banner_msg')} />
          </div>
          <Row label="Display Notification Banner" help="Show the maintenance banner on portal pages." last>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" checked={s.maintenance_show_banner === '1'} onChange={set('maintenance_show_banner')} />
              <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-airtel after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
            </label>
          </Row>
        </div>
      </div>

      <div className="mb-6 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner /> : <Save className="h-4 w-4" />} Save Settings</button>
      </div>

      {system && (
        <div className="card p-5">
          <div className="card-title mb-4"><Info className="h-5 w-5 text-airtel" /> System Information</div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['Python Version', system.python_version],
              ['Server Time (EAT)', system.server_time],
              ['Database Engine', system.database],
              ['API Framework', 'FastAPI'],
              ['Frontend', 'React + Tailwind CSS'],
              ['Portal Version', 'v3.0'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{k}</div>
                <div className="mt-1 font-bold text-slate-800">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
