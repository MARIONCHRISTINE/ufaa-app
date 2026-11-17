import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CloudUpload, Download, FileText, Hourglass, Vault } from 'lucide-react';
import MaintenanceBanner from '../components/MaintenanceBanner';
import { StatCard, fitCharsFor } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, downloadFile } from '../lib/api';
import { fmtMoney, fmtNumber } from '../lib/format';
import RecordsPage from './RecordsPage';

export function TemplateButton({ label = 'Download Template' }) {
  const toast = useToast();
  return (
    <button
      className="btn-outline"
      onClick={() => downloadFile('/template', {}, 'ufaa_upload_template.csv').catch((e) => toast.error(e.message))}
    >
      <Download className="h-4 w-4 text-airtel" /> {label}
    </button>
  );
}

export default function Home() {
  const [stats, setStats] = useState(null);
  const loadStats = useCallback(() => api('/assets/stats').then(setStats).catch(() => {}), []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // One shared number size for the whole row of stat cards.
  const fit = fitCharsFor(stats ? [fmtNumber(stats.total), fmtMoney(stats.unclaimed_amount), fmtMoney(stats.claimed_amount), fmtNumber(stats.letters)] : ['—']);

  const top = (
    <>
      <MaintenanceBanner />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard fitChars={fit} label="Accounts Submitted" value={stats ? fmtNumber(stats.total) : '—'} icon={Vault} />
        <StatCard fitChars={fit} label="Unclaimed Amount" value={stats ? fmtMoney(stats.unclaimed_amount) : '—'} icon={Hourglass} tone="gold" />
        <StatCard fitChars={fit} label="Claimed Amount" value={stats ? fmtMoney(stats.claimed_amount) : '—'} icon={CheckCircle2} tone="green" />
        <StatCard fitChars={fit} label="Holder Letters Issued" value={stats ? fmtNumber(stats.letters) : '—'} icon={FileText} tone="sky" />
      </div>

      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-300 bg-red-50 text-airtel">
            <CloudUpload className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900">Upload Data</h3>
            <p className="text-sm text-slate-500">Upload Excel (.xlsx/.xls) or CSV files directly into the Data Upload portal.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TemplateButton />
          <Link to="/upload?open_file=1" className="btn-primary">
            <CloudUpload className="h-4 w-4" /> Upload Data
          </Link>
        </div>
      </div>
    </>
  );

  return <RecordsPage scope="all" top={top} onDataChanged={loadStats} />;
}
