import { useEffect, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
  dotClass?: string; // e.g. 'tier-dot frontier'
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  full?: boolean;
}

/** Styled single-select dropdown (replaces native <select>). Click-outside to
 *  close; optional search; checkmark on the selected option. */
export function Dropdown({ value, options, onChange, searchable, placeholder, ariaLabel, full = true }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = searchable && q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div className={`dd ${full ? 'dd--full' : ''}`} ref={ref}>
      <button
        type="button"
        className={`dd-trigger ${open ? 'is-open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setQ(''); }}
      >
        <span className="dd-value">
          {selected?.dotClass && <span className={selected.dotClass} />}
          {selected ? selected.label : <span className="dd-placeholder">{placeholder ?? 'Select…'}</span>}
        </span>
        <svg className="dd-caret" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="dd-menu" role="listbox">
          {searchable && (
            <input
              className="dd-search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
            />
          )}
          <div className="dd-options">
            {filtered.length === 0 && <div className="dd-empty">No matches</div>}
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`dd-option ${o.value === value ? 'is-selected' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="dd-option-main">
                  {o.dotClass && <span className={o.dotClass} />}
                  <span className="dd-option-label">{o.label}</span>
                  {o.hint && <span className="dd-option-hint">{o.hint}</span>}
                </span>
                {o.value === value && (
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
