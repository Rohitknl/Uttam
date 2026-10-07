import { useState, useEffect, useRef, Component } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';

export function Card({ children, className = '' }) {
  const hasBg = className.includes('bg-');
  const hasBorder = className.includes('border-');
  const baseBg = hasBg ? '' : 'bg-white';
  const baseBorder = hasBorder ? '' : 'border-line';
  return <div className={`${baseBg} rounded-xl border-2 ${baseBorder} shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b-2 border-line bg-surface/60">
      <div>
        <h2 className="font-display text-xl font-bold text-forest-950">{title}</h2>
        {subtitle && <p className="text-sm font-medium text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', size = 'md', className = '', disabled, type = 'button', ...props }) {
  const variants = {
    primary: 'bg-forest-700 text-white border-2 border-forest-950 hover:bg-forest-800 shadow-sm disabled:opacity-50',
    secondary: 'bg-forest-50 text-forest-800 border-2 border-forest-600 hover:bg-forest-100 disabled:opacity-50',
    danger: 'bg-red-600 text-white border-2 border-red-700 hover:bg-red-700 shadow-sm disabled:opacity-50',
    ghost: 'text-forest-800 hover:bg-forest-100 disabled:opacity-50 font-semibold',
    saffron: 'bg-saffron-500 text-white border-2 border-saffron-600 hover:bg-saffron-600 shadow-sm disabled:opacity-50',
  };
  const sizes = { sm: 'px-3.5 py-1.5 text-sm', md: 'px-4.5 py-2 text-[15px]', lg: 'px-6 py-2.5 text-base' };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-all cursor-pointer ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, className = '', type = 'text', showPasswordToggle = true, ...props }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={className}>
      {label && <label className="block text-[15px] font-bold text-forest-950 mb-1">{label}</label>}
      <div className="relative">
        <input
          type={effectiveType}
          className={`w-full px-3.5 py-2 text-base font-medium ${isPassword && showPasswordToggle ? 'pr-10' : ''} rounded-lg border-2 border-line bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 ${error ? 'border-red-500' : ''}`}
          {...props}
        />
        {isPassword && showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-ink focus:outline-none transition-colors cursor-pointer select-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4 text-muted hover:text-forest-700" /> : <Eye className="w-4 h-4 text-muted hover:text-forest-700" />}
          </button>
        )}
      </div>
      {error && <p className="text-red-500 text-xs font-semibold mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-[15px] font-bold text-forest-950 mb-1">{label}</label>}
      <select
        className={`w-full px-3.5 py-2 text-base font-medium rounded-lg border-2 border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 ${error ? 'border-red-500' : ''}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-red-500 text-xs font-semibold mt-1">{error}</p>}
    </div>
  );
}

/** Click-to-open dropdown — portals menu so it works inside scrollable modals */
export function DropdownSelect({
  label,
  error,
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  className = '',
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Type to search...',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    if (!open || !btnRef.current) return undefined;

    const place = () => {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 280 && rect.top > spaceBelow;
      const maxHeight = Math.min(300, Math.max(120, openUp ? rect.top - 12 : spaceBelow - 12));
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 240),
        zIndex: 80,
        maxHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };

    place();
    setQuery('');
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  const selected = options.find(o => String(o.value) === String(value));
  const display = selected ? selected.label : placeholder;
  const q = query.trim().toLowerCase();
  const filtered = !searchable || !q
    ? options
    : options.filter(o => String(o.label).toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q));

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label && <label className="block text-[15px] font-bold text-forest-950 mb-1">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`w-full px-3.5 py-2 rounded-lg border-2 border-line bg-white text-left text-ink text-base font-medium focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 disabled:opacity-60 flex items-center justify-between gap-2 shadow-2xs ${error ? 'border-red-500' : ''}`}
      >
        <span className={`truncate ${selected ? 'font-semibold text-ink' : 'text-muted'}`}>{display}</span>
        <ChevronDown className={`w-4 h-4 text-forest-700 shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-forest-900' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="flex flex-col overflow-hidden overscroll-contain rounded-xl border-2 border-forest-700/40 bg-white shadow-2xl animate-in fade-in-50 duration-150"
          onWheel={e => e.stopPropagation()}
        >
          {searchable && (
            <div className="shrink-0 border-b-2 border-line p-2.5 bg-surface/50">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full px-3 py-2 text-base font-medium rounded-lg border-2 border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700"
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1 min-h-0 panel-scroll py-1.5">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-base text-muted font-medium">No matching options</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`w-full px-4 py-2.5 text-left text-[15px] font-medium transition-colors hover:bg-forest-100 ${String(opt.value) === String(value) ? 'bg-forest-200/70 text-forest-950 font-bold' : 'text-ink'}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
      {error && <p className="text-red-500 text-xs font-semibold mt-1">{error}</p>}
    </div>
  );
}

/** Searchable, free-text combobox with portalled dropdown suggestions */
export function Combobox({
  label,
  error,
  value = '',
  onChange,
  onBlur,
  options = [],
  placeholder = '',
  className = '',
  inputClassName = '',
  disabled = false,
  autoComplete = 'off',
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  const valTrimmed = String(value ?? '').trim().toLowerCase();

  // If the user's typed value exactly matches one option, or is empty, show all options.
  // Otherwise, filter options that match the typed query.
  const hasExactMatch = options.some(opt => {
    const v = String(typeof opt === 'string' ? opt : (opt.value ?? opt.label)).trim().toLowerCase();
    return v === valTrimmed;
  });

  const filtered = (!valTrimmed || hasExactMatch)
    ? options
    : options.filter(opt => {
        const text = typeof opt === 'string' ? opt : (opt.label || opt.value || '');
        return text.toLowerCase().includes(valTrimmed);
      });

  useEffect(() => {
    if (!open || !inputRef.current) return undefined;

    const place = () => {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 220 && rect.top > spaceBelow;
      const maxHeight = Math.min(240, Math.max(100, openUp ? rect.top - 12 : spaceBelow - 12));
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 80,
        maxHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };

    place();
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  const selectOption = (opt) => {
    const val = typeof opt === 'string' ? opt : (opt.value ?? opt.label);
    onChange(val);
    setOpen(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(idx => (idx + 1 < filtered.length ? idx + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(idx => (idx - 1 >= 0 ? idx - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      if (open && highlightIndex >= 0 && highlightIndex < filtered.length) {
        e.preventDefault();
        selectOption(filtered[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            if (!open) setOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            if (options.length > 0) setOpen(true);
          }}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`w-full px-3 py-2 pr-9 rounded-lg border border-line bg-white text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 transition-colors ${error ? 'border-red-500' : ''} ${inputClassName}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            setOpen(v => !v);
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-muted hover:text-ink focus:outline-none disabled:opacity-50"
          title="Toggle dropdown"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180 text-forest-700' : ''}`} />
        </button>
      </div>
      {open && filtered.length > 0 && (
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="flex flex-col overflow-hidden overscroll-contain rounded-lg border border-line bg-white shadow-lg animate-in fade-in-50 duration-150"
            onWheel={e => e.stopPropagation()}
            onMouseDown={e => e.preventDefault()}
          >
            <div className="overflow-y-auto flex-1 min-h-0 panel-scroll py-1">
              {filtered.map((opt, idx) => {
                const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label);
                const optLabel = typeof opt === 'string' ? opt : opt.label;
                const isSelected = String(optVal).trim().toLowerCase() === valTrimmed;
                const isHighlighted = idx === highlightIndex;

                return (
                  <button
                    key={`${optVal}-${idx}`}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-forest-100 text-forest-800 font-semibold'
                        : isHighlighted
                          ? 'bg-forest-50 text-ink'
                          : 'text-ink hover:bg-forest-50'
                    }`}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => selectOption(opt)}
                  >
                    {optLabel}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      )}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}


/** Table panel with a constant horizontal scrollbar pinned to the bottom edge */
export function StickyHScroll({ children, className = '' }) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-scroll overscroll-contain ${className}`}>
      {children}
    </div>
  );
}

export function Textarea({ label, error, className = '', rows = 3, ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
      <textarea
        className={`w-full px-3 py-2 rounded-lg border border-line bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 ${error ? 'border-red-500' : ''}`}
        rows={rows}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-forest-100 text-forest-950 border border-forest-600 font-bold',
    success: 'bg-emerald-100 text-emerald-950 border border-emerald-600 font-bold',
    warning: 'bg-amber-100 text-amber-950 border border-amber-600 font-bold',
    danger: 'bg-rose-100 text-rose-950 border border-rose-600 font-bold',
    info: 'bg-sky-100 text-sky-950 border border-sky-600 font-bold',
    purple: 'bg-purple-100 text-purple-950 border border-purple-600 font-bold',
    saffron: 'bg-orange-100 text-orange-950 border border-orange-600 font-bold',
    neutral: 'bg-slate-100 text-slate-800 border border-slate-400 font-semibold',
  };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs md:text-sm font-bold shadow-2xs ${variants[variant] || variants.default} ${className}`}>{children}</span>;
}

/** ErrorBoundary that auto-closes the modal if children crash */
class ModalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.error('[Modal] Child render error — auto-closing modal:', err);
    // Auto-close the modal after a tick so the parent can clean up
    setTimeout(() => {
      if (this.props.onClose) this.props.onClose();
    }, 0);
  }
  componentDidUpdate(prevProps) {
    // Reset error state when modal is re-opened with new children
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-base text-red-700 bg-red-50 rounded-lg border-2 border-red-300 font-medium">
          Something went wrong displaying this content. The modal will close automatically.
        </div>
      );
    }
    return this.props.children;
  }
}

export function Modal({ open, onClose, title, children, size = 'md', scrollable = true, footer }) {
  // Safety: force-clean pointer-events on document.body when modal mounts/unmounts
  useEffect(() => {
    if (!open) return;
    const cleanup = () => {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
      const root = document.getElementById('root');
      if (root && root.style.pointerEvents === 'none') {
        root.style.pointerEvents = '';
      }
    };
    return cleanup;
  }, [open]);

  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-5xl' };

  const safeClose = () => {
    try {
      if (onClose) onClose();
    } catch (err) {
      console.error('[Modal] onClose error:', err);
    }
    if (document.body.style.pointerEvents === 'none') {
      document.body.style.pointerEvents = '';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={safeClose} />
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full ${sizes[size]} flex flex-col overflow-hidden border-2 border-forest-700/30`}
        style={{ maxHeight: 'calc(100vh - 1.5rem)' }}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b-2 border-line bg-surface/70">
          <h3 className="font-display text-xl font-bold text-forest-950">{title}</h3>
          <button type="button" onClick={safeClose} className="text-muted hover:text-ink text-2xl leading-none font-bold cursor-pointer">&times;</button>
        </div>
        <div
          className={`px-5 py-4 min-h-0 ${
            scrollable || footer
              ? 'flex-1 overflow-y-auto overflow-x-hidden overscroll-contain panel-scroll'
              : 'overflow-visible'
          }`}
        >
          <ModalErrorBoundary onClose={safeClose} resetKey={title}>
            {children}
          </ModalErrorBoundary>
        </div>
        {footer && (
          <div className="shrink-0 w-full px-5 py-3 border-t-2 border-line bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Alert({ type = 'info', children, onClose }) {
  const types = {
    info: 'bg-sky-50 border-2 border-sky-400 text-sky-950',
    success: 'bg-emerald-50 border-2 border-emerald-500 text-emerald-950',
    warning: 'bg-amber-50 border-2 border-amber-500 text-amber-950',
    error: 'bg-rose-50 border-2 border-rose-500 text-rose-950',
  };
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl shadow-xs font-medium text-base ${types[type]}`}>
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && <button onClick={onClose} className="text-current opacity-70 hover:opacity-100 text-xl font-bold cursor-pointer">&times;</button>}
    </div>
  );
}

export function Table({ columns, data, onRowClick, showNumber = false, maxHeight, fit = false, getRowClassName }) {
  return (
    <div
      className={
        maxHeight
          ? 'overflow-auto w-full border-2 border-line rounded-xl shadow-xs'
          : fit
            ? 'overflow-visible w-full border border-line rounded-xl'
            : 'w-full'
      }
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={`text-base border-collapse ${fit ? 'w-full table-fixed' : 'w-max min-w-full'}`}>
        <thead className="sticky top-0 z-10">
          <tr className="border-b-2 border-forest-700 bg-forest-50">
            {showNumber && (
              <th className={`px-4 py-3 text-left font-bold text-forest-950 bg-forest-100/90 uppercase tracking-wider text-xs whitespace-nowrap ${fit ? 'w-14 px-2 py-2.5' : ''}`}>#</th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-bold text-forest-950 bg-forest-100/90 uppercase tracking-wider text-xs whitespace-nowrap ${fit ? 'px-2 py-2.5 truncate' : ''} ${col.className || ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (showNumber ? 1 : 0)} className="px-4 py-8 text-center text-muted font-medium">No records found</td>
            </tr>
          ) : data.map((row, i) => {
            const customRowClass = getRowClassName ? getRowClassName(row, i) : '';
            return (
              <tr
                key={row.id ?? i}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-line hover:bg-forest-50/60 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${i % 2 === 1 ? 'bg-surface/40' : 'bg-white'} ${customRowClass}`}
              >
              {showNumber && (
                <td className={`px-4 py-3 whitespace-nowrap font-bold text-forest-800 ${fit ? 'px-2 py-2 text-xs' : ''}`}>{i + 1}</td>
              )}
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`px-4 py-3 whitespace-nowrap font-medium text-ink ${fit ? 'px-2 py-2 text-xs truncate' : ''} ${col.className || ''}`}
                  title={fit && !col.render ? String(row[col.key] ?? '') : undefined}
                >
                  {col.render ? col.render(row, i) : row[col.key]}
                </td>
              ))}
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-forest-700" />
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 rounded-lg border border-line bg-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-700/30"
      />
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  );
}

export function PageHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-6 ${className}`}>
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
