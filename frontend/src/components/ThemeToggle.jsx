import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'ufaa_theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Light/dark switch. The choice is remembered per browser; the default follows the system setting. */
export default function ThemeToggle({ variant = 'inline', className = '' }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  };

  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  if (variant === 'sidebar') {
    // Sits in the sidebar like a nav item, with an on/off switch on the right.
    return (
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        onClick={flip}
        title={label}
        className={`flex w-full items-center gap-4 border-l-4 border-transparent px-6 py-3 text-left text-[0.95rem] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 ${className}`}
      >
        {dark ? <Sun className="h-[1.1rem] w-5" /> : <Moon className="h-[1.1rem] w-5" />}
        <span className="flex-1">Dark Mode</span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${dark ? 'bg-airtel' : 'bg-slate-300'}`}>
          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-4' : ''}`} />
        </span>
      </button>
    );
  }

  // Compact text button (login / register card footer).
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
