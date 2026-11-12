import { Children, isValidElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../select.css';

const textOf = (children) => Children.toArray(children).map((child) => isValidElement(child) ? textOf(child.props.children) : String(child)).join('');
const normalize = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
function readOptions(children, group = '') {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === 'optgroup') return readOptions(child.props.children, child.props.label);
    if (child.type !== 'option') return readOptions(child.props.children, group);
    const label = textOf(child.props.children);
    return [{ value: String(child.props.value ?? label), label, group, disabled: Boolean(child.props.disabled) }];
  });
}

export default function Select({ children, value = '', onChange, name, disabled = false, required = false,
  searchable, searchLabel = 'Buscar opciones', fallbackValue, id, className = '', ...aria }) {
  const generatedId = useId();
  const triggerId = id || `select-${generatedId}`;
  const listId = `${triggerId}-list`;
  const options = readOptions(children);
  const selected = options.find((option) => option.value === String(value));
  const canSearch = searchable ?? options.length > 7;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({});
  const trigger = useRef(null);
  const popup = useRef(null);
  const search = useRef(null);
  const list = useRef(null);
  const typed = useRef({ value: '', at: 0 });
  const filtered = options.filter((option) => option.value === fallbackValue || normalize(`${option.label} ${option.group}`).includes(normalize(query)));

  const place = useCallback(() => {
    const rect = trigger.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const above = spaceBelow < 230 && rect.top > spaceBelow;
    const height = Math.max(100, Math.min(340, above ? rect.top - 16 : spaceBelow));
    const width = Math.min(Math.max(rect.width, 250), window.innerWidth - 24);
    return { position: 'fixed', width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      maxHeight: height, ...(above ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) };
  }, []);
  const show = () => {
    if (trigger.current.matches(':disabled')) return;
    setPosition(place()); setQuery('');
    const index = options.findIndex((option) => option.value === String(value) && !option.disabled);
    setActiveIndex(index >= 0 ? index : Math.max(0, options.findIndex((option) => !option.disabled)));
    setOpen(true);
  };
  const close = (restoreFocus = false) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  const choose = (option) => {
    if (!option || option.disabled) return;
    onChange?.({ target: { name, value: option.value }, currentTarget: { name, value: option.value } });
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    (canSearch ? search.current : list.current)?.focus({ preventScroll: true });
    const outside = (event) => {
      if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const reposition = (event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
      // Acompaña al campo cuando el navegador lo desplaza para darle foco.
      setPosition(place());
    };
    const navigate = () => setOpen(false);
    const focusOutside = (event) => {
      if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('hashchange', navigate);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusOutside);
      window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('hashchange', navigate);
    };
  }, [open, canSearch, place]);

  useEffect(() => {
    if (!open) return;
    const item = document.getElementById(`${listId}-${activeIndex}`);
    const container = list.current;
    if (!item || !container) return;
    if (item.offsetTop < container.scrollTop) container.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = item.offsetTop + item.offsetHeight - container.clientHeight;
  }, [activeIndex, listId, open]);

  const keys = (event) => {
    if (event.key === 'Tab') { close(true); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      const enabled = filtered.map((option, index) => !option.disabled ? index : -1).filter((index) => index >= 0);
      const current = enabled.indexOf(activeIndex);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
        (current + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
      if (enabled[next] !== undefined) setActiveIndex(enabled[next]);
    } else if (event.key === 'Enter' || (event.key === ' ' && !canSearch)) {
      event.preventDefault(); if (open) choose(filtered[activeIndex]); else show();
    } else if (open && !canSearch && event.key.length === 1) {
      const now = Date.now();
      typed.current = { value: (now - typed.current.at < 700 ? typed.current.value : '') + event.key, at: now };
      const index = filtered.findIndex((option) => !option.disabled && normalize(option.label).startsWith(normalize(typed.current.value)));
      if (index >= 0) setActiveIndex(index);
    }
  };

  return <div className={`select-control ${open ? 'is-open' : ''} ${className}`}>
    <button {...aria} ref={trigger} id={triggerId} title={selected?.label} type="button" role="combobox" className={`select-trigger ${String(value) === '' ? 'is-placeholder' : ''}`}
      disabled={disabled} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-required={required || undefined}
      onKeyDown={keys} onClick={() => open ? close(true) : show()}>
      <span>{selected?.label || 'Selecciona una opción'}</span><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    {open && createPortal(<div ref={popup} className="select-popover" style={position}>
      {canSearch && <div className="select-search"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.2" stroke="currentColor" strokeWidth="1.5" /><path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><input ref={search} role="combobox" aria-label={searchLabel} aria-expanded="true" aria-controls={listId} aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined} placeholder={searchLabel} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={keys} /></div>}
      <div ref={list} id={listId} className="select-options" role="listbox" aria-labelledby={triggerId} tabIndex={-1} aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined} onKeyDown={keys}>
        {filtered.map((option, index) => <div key={`${option.group}-${option.value}`}>
          {option.group && (index === 0 || filtered[index - 1].group !== option.group) && <div className="select-group" role="presentation">{option.group}</div>}
          <div id={`${listId}-${index}`} role="option" aria-selected={option.value === String(value)} aria-disabled={option.disabled || undefined}
            className={`select-option ${activeIndex === index ? 'is-highlighted' : ''}`} onPointerMove={() => { if (!option.disabled) setActiveIndex(index); }} onClick={() => choose(option)}>
            <span>{option.label}</span>{option.value === String(value) && <span className="select-check" aria-hidden="true">✓</span>}
          </div>
        </div>)}
        {!filtered.length && <p className="select-no-results" role="status">No hay opciones con ese nombre.</p>}
      </div>
      {canSearch && <div className="select-help">↑ ↓ para navegar · Enter para elegir · Esc para cerrar</div>}
    </div>, document.body)}
  </div>;
}
