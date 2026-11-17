import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

// Same look as the PHP .toast-notification: white card with a coloured left edge.
const STYLES = {
  success: { edge: 'border-l-green-600', icon: 'text-green-600', Icon: CheckCircle2 },
  error: { edge: 'border-l-airtel', icon: 'text-airtel', Icon: XCircle },
  info: { edge: 'border-l-blue-600', icon: 'text-blue-600', Icon: Info },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const toast = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="no-print fixed bottom-8 right-8 z-[100000] flex w-[min(92vw,400px)] flex-col gap-3">
        {toasts.map(({ id, type, message }) => {
          const { edge, icon, Icon } = STYLES[type];
          return (
            <div key={id} className={`toast-in flex items-center gap-3 rounded-xl border border-l-4 border-slate-200 bg-surface px-6 py-4 text-[0.9rem] font-medium text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.1)] ${edge}`}>
              <Icon className={`h-5 w-5 shrink-0 ${icon}`} />
              <span>{message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
