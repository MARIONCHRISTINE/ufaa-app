import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';

export default function MaintenanceBanner() {
  const [s, setS] = useState(null);

  useEffect(() => {
    api('/settings/public').then(setS).catch(() => {});
  }, []);

  if (!s || s.maintenance_show_banner !== '1' || !['1', 'scheduled'].includes(s.maintenance_mode)) return null;
  const now = s.maintenance_mode === '1';
  return (
    <div className={`mb-6 flex items-center gap-4 rounded-xl border px-5 py-4 ${now ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
      <TriangleAlert className={`h-6 w-6 shrink-0 ${now ? 'text-red-500' : 'text-amber-500'}`} />
      <div className="text-sm leading-relaxed text-slate-700">
        <strong className={now ? 'text-red-600' : 'text-amber-600'}>
          {now ? 'System Under Maintenance Notice: ' : 'Scheduled Maintenance Notice: '}
        </strong>
        {s.maintenance_banner_msg || 'System maintenance is scheduled.'}
        {!now && s.maintenance_scheduled_at && (
          <span className="ml-1 font-semibold text-amber-700">(Scheduled for {fmtDateTime(s.maintenance_scheduled_at)})</span>
        )}
      </div>
    </div>
  );
}
