import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-line shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-line">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
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
    primary: 'bg-forest-700 text-white hover:bg-forest-950 disabled:opacity-50',
    secondary: 'bg-forest-100 text-forest-700 hover:bg-line disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
    ghost: 'text-muted hover:bg-forest-100 disabled:opacity-50',
    saffron: 'bg-saffron-500 text-white hover:bg-saffron-500/90 disabled:opacity-50',
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5' };
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-colors ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
      <input
        className={`w-full px-3 py-2 rounded-lg border border-line bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 ${error ? 'border-red-500' : ''}`}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
      <select
        className={`w-full px-3 py-2 rounded-lg border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 ${error ? 'border-red-500' : ''}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
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
      const openUp = spaceBelow < 240 && rect.top > spaceBelow;
      const maxHeight = Math.min(240, openUp ? rect.top - 12 : spaceBelow - 12);
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 220),
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
      {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`w-full px-3 py-2 rounded-lg border border-line bg-white text-left text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700 disabled:opacity-60 ${error ? 'border-red-500' : ''}`}
      >
        <span className={selected ? '' : 'text-muted'}>{display}</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="flex flex-col overflow-hidden overscroll-contain rounded-lg border border-line bg-white shadow-lg"
          onWheel={e => e.stopPropagation()}
        >
          {searchable && (
            <div className="shrink-0 border-b border-line p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full px-2 py-1.5 text-sm rounded border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30"
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1 min-h-0">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">No matching options</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-forest-100 ${String(opt.value) === String(value) ? 'bg-forest-100 text-forest-700 font-medium' : 'text-ink'}`}
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

export function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-forest-100 text-forest-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-saffron-100 text-saffron-500',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, size = 'md', scrollable = true, footer }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full ${sizes[size]} flex flex-col overflow-hidden`}
        style={{ maxHeight: 'calc(100vh - 1.5rem)' }}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div
          className={`px-5 py-3 min-h-0 ${
            scrollable || footer
              ? 'flex-1 overflow-y-auto overflow-x-hidden overscroll-contain panel-scroll'
              : 'overflow-visible'
          }`}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 w-full px-5 py-3 border-t border-line bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Alert({ type = 'info', children, onClose }) {
  const types = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-saffron-100 border-saffron-500/30 text-saffron-500',
    error: 'bg-red-50 border-red-200 text-red-800',
  };
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${types[type]}`}>
      <div className="flex-1 text-sm">{children}</div>
      {onClose && <button onClick={onClose} className="text-current opacity-60 hover:opacity-100">&times;</button>}
    </div>
  );
}

export function Table({ columns, data, onRowClick, showNumber = false, maxHeight, fit = false }) {
  return (
    <div
      className={
        maxHeight
          ? 'overflow-auto w-full border border-line rounded-lg'
          : fit
            ? 'overflow-visible w-full'
            : 'w-full'
      }
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={`text-sm border-collapse ${fit ? 'w-full table-fixed' : 'w-max min-w-full'}`}>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-line bg-surface">
            {showNumber && (
              <th className={`px-4 py-3 text-left font-medium text-muted bg-surface whitespace-nowrap ${fit ? 'w-12 px-2 py-2.5 text-xs' : ''}`}>Count</th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-medium text-muted bg-surface whitespace-nowrap ${fit ? 'px-2 py-2.5 text-xs truncate' : ''} ${col.className || ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (showNumber ? 1 : 0)} className="px-4 py-8 text-center text-muted">No records found</td>
            </tr>
          ) : data.map((row, i) => (
            <tr key={row.id ?? i} onClick={() => onRowClick?.(row)} className={`border-b border-line/50 hover:bg-surface/30 ${onRowClick ? 'cursor-pointer' : ''}`}>
              {showNumber && (
                <td className={`px-4 py-3 whitespace-nowrap font-medium text-ink ${fit ? 'px-2 py-2 text-xs' : ''}`}>{i + 1}</td>
              )}
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`px-4 py-3 whitespace-nowrap ${fit ? 'px-2 py-2 text-xs truncate' : ''} ${col.className || ''}`}
                  title={fit && !col.render ? String(row[col.key] ?? '') : undefined}
                >
                  {col.render ? col.render(row, i) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
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
