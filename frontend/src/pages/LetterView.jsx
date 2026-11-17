import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileDown, FileText, Printer, X } from 'lucide-react';
import { Spinner } from '../components/ui';
import { api, downloadFile } from '../lib/api';

export default function LetterView() {
  const { id } = useParams();
  const [letter, setLetter] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/letters/${id}`)
      .then((data) => {
        setLetter(data);
        document.title = `Holder Confirmation Letter - ${data.record_id}`;
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const downloadPdf = async () => {
    setBusy(true);
    try {
      await downloadFile(`/letters/${id}/pdf`, {}, `Holder_Letter_${id}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center text-slate-200">
          <h2 className="mb-2 text-xl font-bold text-white">Unable to Open Letter</h2>
          <p className="mb-5 text-sm text-slate-400">{error}</p>
          <button onClick={() => window.close()} className="btn-primary">Close Tab</button>
        </div>
      </div>
    );
  }
  if (!letter) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="theme-light min-h-screen bg-slate-900 pb-10 print:bg-white print:pb-0">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-6 py-3 text-white shadow-lg">
        <div className="flex items-center gap-2 font-semibold">
          <FileText className="h-5 w-5 text-red-400" /> Airtel Money Holder Confirmation Letter #{letter.record_id}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn bg-sky-600 text-white hover:bg-sky-700"><Printer className="h-4 w-4" /> Print Letter</button>
          <button onClick={downloadPdf} disabled={busy} className="btn bg-red-600 text-white hover:bg-red-700">
            {busy ? <Spinner /> : <FileDown className="h-4 w-4" />} Download PDF
          </button>
          <button onClick={() => window.close()} className="btn bg-slate-600 text-white hover:bg-slate-700"><X className="h-4 w-4" /> Close</button>
        </div>
      </div>

      <div className="flex justify-center px-4 py-8 print:p-0">
        <div className="min-h-[297mm] w-[210mm] max-w-full rounded bg-white p-[20mm] text-[13px] leading-relaxed text-slate-800 shadow-2xl print:min-h-0 print:w-full print:p-0 print:shadow-none">
          <div className="mb-6 flex items-center justify-between border-b-[2.5px] border-red-600 pb-4">
            <img src="/logo.png" alt="Airtel logo" className="h-14 w-auto object-contain" />
            <div className="text-right text-[11px] leading-snug text-slate-600">
              <div className="text-base font-extrabold tracking-wide text-red-600">AIRTEL MONEY KENYA LIMITED</div>
              <div>Airtel Park, Parkside Towers, Mombasa Road</div>
              <div>P.O. Box 73335 - 00200, Nairobi, Kenya</div>
              <div>Tel: +254 733 100 100 | www.airtelkenya.com</div>
            </div>
          </div>

          <div className="mb-5 flex justify-between font-bold">
            <div>REF NO: {letter.ref_no}</div>
            <div>DATE: {letter.date_str}</div>
          </div>

          <div className="mb-5 leading-snug">
            <div className="font-bold">TO:</div>
            <div>The Chief Executive Officer / Managing Director</div>
            <div className="font-bold">Unclaimed Financial Assets Authority (UFAA)</div>
            <div>P.O. Box 28235 - 00200, Nairobi, Kenya</div>
          </div>

          <div className="mb-5 border-b-[1.5px] border-red-600 pb-1 text-sm font-bold uppercase text-red-600">
            RE: Holder Confirmation Letter — Claimant Asset Details
          </div>
          <div className="mb-3 font-semibold">Dear Sir / Madam,</div>
          <p className="mb-5 text-justify">
            We write to confirm that the unclaimed financial asset(s) listed below are recorded under{' '}
            <strong>Airtel Money Kenya Limited</strong> and have been processed in compliance with the Unclaimed Financial
            Assets Authority guidelines.
          </p>

          <div className="mb-5 overflow-hidden rounded border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-bold">CLAIMANT INFORMATION</div>
            <div className="flex border-b border-slate-100 px-3 py-2"><div className="w-40 text-slate-600">Owner Name:</div><div className="font-bold">{letter.owner_name}</div></div>
            <div className="flex px-3 py-2"><div className="w-40 text-slate-600">ID / Passport No:</div><div className="font-bold">{letter.id_no}</div></div>
          </div>

          <table className="mb-5 w-full border-collapse text-xs">
            <thead>
              <tr className="bg-red-600 text-white">
                <th className="w-8 border border-red-600 px-2 py-2 text-center">#</th>
                <th className="border border-red-600 px-2 py-2 text-left">Account Number</th>
                <th className="border border-red-600 px-2 py-2 text-left">Last Transaction</th>
                <th className="border border-red-600 px-2 py-2 text-right">Due Amount</th>
                <th className="border border-red-600 px-2 py-2 text-center">Compilation Date</th>
              </tr>
            </thead>
            <tbody>
              {letter.records.map((r, i) => (
                <tr key={r.record_id} className="even:bg-slate-50">
                  <td className="border border-slate-200 px-2 py-2 text-center">{i + 1}</td>
                  <td className="border border-slate-200 px-2 py-2">{r.account_number || '-'}</td>
                  <td className="border border-slate-200 px-2 py-2">{(r.last_transaction || '-').substring(0, 30)}</td>
                  <td className="border border-slate-200 px-2 py-2 text-right">{r.due_amount || '-'}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center">{r.compilation_date || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mb-6 text-justify">
            This letter confirms that the above unclaimed asset records belong to the specified owner as per our records
            submitted to the Unclaimed Financial Assets Authority.
          </p>
          <div className="mb-5 font-semibold">Yours faithfully,</div>

          <div className="mt-8 flex items-end justify-between break-inside-avoid">
            <div className="leading-relaxed">
              <div className="mb-1.5 font-bold text-red-600">AIRTEL MONEY KENYA LIMITED</div>
              <div className="mb-2">Signature: ___________________________</div>
              <div>Name: <strong>Peter Mwangi</strong></div>
              <div>Title: <strong>Risk and Compliance Lead</strong></div>
              <div>Date: {letter.date_str}</div>
            </div>
            <div className="flex h-24 w-60 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-[11px] font-bold text-slate-400">
              [ OFFICIAL COMPANY STAMP ]
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
