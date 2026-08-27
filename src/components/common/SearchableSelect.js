import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { HiOutlineSearch, HiOutlineChevronDown } from 'react-icons/hi';

/**
 * A select whose search lives inside the dropdown itself, rather than as a
 * separate field beside it. Options are matched on name and email.
 *
 * options: [{ id, name, email? }]
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
  id,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((o) => o.id === value) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name?.toLowerCase().includes(q) || o.email?.toLowerCase().includes(q)
    );
  }, [options, search]);

  // Closing always discards the query, so the panel can never reopen showing a
  // stale filter. Doing it here rather than in an effect on open keeps it
  // independent of render timing.
  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  // Dismiss on an outside tap or Escape. touchstart is listened for alongside
  // mousedown so the panel closes on mobile too.
  useEffect(() => {
    if (!open) return undefined;
    function onOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Focus the field so the panel is ready to type into as soon as it opens.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function pick(optionId) {
    onChange(optionId);
    close();
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        id={id}
        className="form-input"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{
          color: selected ? 'var(--gray-900)' : 'var(--gray-400)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selected ? selected.name : placeholder}
        </span>
        <HiOutlineChevronDown style={{
          color: 'var(--gray-400)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--transition-fast)',
        }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--white)', border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid var(--gray-100)' }}>
            <HiOutlineSearch style={{
              position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--gray-400)', fontSize: '0.875rem',
            }} />
            <input
              ref={searchRef}
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id={id ? `${id}-search` : undefined}
              style={{
                width: '100%', padding: '8px 10px 8px 32px', fontSize: '0.8125rem',
                border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)',
                background: 'var(--white)', outline: 'none',
              }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {value && (
              <div
                role="option"
                aria-selected={false}
                onClick={() => pick('')}
                style={{
                  padding: '10px 12px', fontSize: '0.875rem', cursor: 'pointer',
                  color: 'var(--gray-400)', borderBottom: '1px solid var(--gray-100)',
                }}
              >
                {placeholder}
              </div>
            )}
            {filtered.length === 0 ? (
              <p style={{ padding: 12, fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
                {emptyLabel}
              </p>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.id}
                  role="option"
                  aria-selected={o.id === value}
                  onClick={() => pick(o.id)}
                  style={{
                    padding: '10px 12px', fontSize: '0.875rem', cursor: 'pointer',
                    background: o.id === value ? 'var(--green-50)' : 'transparent',
                    color: o.id === value ? 'var(--green-700)' : 'var(--gray-800)',
                    fontWeight: o.id === value ? 600 : 400,
                  }}
                >
                  {o.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
