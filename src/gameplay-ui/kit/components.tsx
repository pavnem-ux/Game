import { useEffect, useId, useRef } from 'react';
import { CurrencyIcon } from './CurrencyIcon';
import type { ReactNode } from 'react';
import { EN } from '../strings-en';
import { formatGold, progressFraction } from './logic';
import type { StatDelta } from './logic';

/**
 * Task 13 shared UI kit (presentation only). Components render props; every action is a callback
 * supplied by the screen, which calls the existing campaign store.
 */

/** Night sky with a vignette and slowly drifting light motes (static with reduced motion). */
export function Backdrop({ act }: { act?: number }) {
  return (
    <div className={`meta-backdrop ${act ? `act-${act}` : ''}`} aria-hidden="true">
      <div className="meta-vignette" />
      <div className="meta-motes">
        {MOTES.map((m, i) => (
          <span
            key={i}
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
              width: m.size,
              height: m.size,
            }}
          />
        ))}
      </div>
    </div>
  );
}
/** Deterministic mote layout (no randomness: the same every render). */
const MOTES = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37 + 11) % 97,
  y: (i * 53 + 23) % 93,
  delay: -((i * 1.7) % 12),
  duration: 14 + ((i * 3) % 9),
  size: 2 + (i % 3),
}));

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
/**
 * Button: primary (candle-gold), secondary, danger, ghost. A disabled button keeps its reason as
 * a tooltip and accessible description.
 */
export function Button({
  variant = 'secondary',
  size = 'm',
  disabledReason,
  className = '',
  children,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
  variant?: ButtonVariant;
  size?: 's' | 'm' | 'l';
  /** Non-null → disabled with this reason. */
  disabledReason?: string | null;
  disabled?: boolean;
}) {
  const disabled = rest.disabled === true || (disabledReason ?? null) !== null;
  const reasonId = useId();
  const { disabled: _ignored, ...props } = rest;
  return (
    <>
      <button
        {...props}
        className={`kit-button kit-button-${variant} kit-button-${size} ${className}`}
        disabled={disabled}
        title={disabledReason ?? props.title}
        aria-describedby={disabledReason ? reasonId : props['aria-describedby']}
      >
        {children}
      </button>
      {disabledReason && (
        <span id={reasonId} className="visually-hidden">
          {disabledReason}
        </span>
      )}
    </>
  );
}

/** Parchment-edged panel with thin ornamental corners. */
export function Panel({
  title,
  actions,
  className = '',
  children,
  ...rest
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode; actions?: ReactNode }) {
  return (
    <section {...rest} className={`kit-panel ${className}`}>
      <span className="kit-corner tl" aria-hidden="true" />
      <span className="kit-corner tr" aria-hidden="true" />
      <span className="kit-corner bl" aria-hidden="true" />
      <span className="kit-corner br" aria-hidden="true" />
      {(title || actions) && (
        <header className="kit-panel-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="kit-panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Tabs: a group of toggle buttons (aria-pressed), keyboard-friendly (arrow keys move focus). */
export function Tabs<T extends string | number>({
  label,
  items,
  value,
  onChange,
  className = '',
}: {
  label: string;
  items: readonly { id: T; label: ReactNode; title?: string; ariaLabel?: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    buttons[(i + dir + buttons.length) % buttons.length].focus();
  };
  return (
    <div
      ref={ref}
      className={`kit-tabs ${className}`}
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') move(e, 1);
        else if (e.key === 'ArrowLeft') move(e, -1);
      }}
    >
      {items.map((item) => (
        <button
          key={String(item.id)}
          className={`kit-tab ${item.id === value ? 'active' : ''}`}
          aria-pressed={item.id === value}
          aria-label={item.ariaLabel}
          title={item.title}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Modal confirm dialog: focus moves to the confirm button, Enter confirms, Esc cancels, focus
 * returns to the opener when it closes.
 */
export function ConfirmModal({
  title,
  children,
  confirmLabel = EN.meta.modal.confirm,
  cancelLabel = EN.meta.modal.cancel,
  variant = 'primary',
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div className="kit-modal-backdrop" onClick={onCancel}>
      <div
        className="kit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h3 id={titleId}>{title}</h3>
        {children}
        <div className="kit-modal-actions">
          <button
            ref={confirmRef}
            className={`kit-button kit-button-${variant} kit-button-m`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button className="kit-button kit-button-secondary kit-button-m" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Stat-compare tooltip body: +/− per stat in green / red. */
export function CompareList({ deltas, empty }: { deltas: readonly StatDelta[]; empty: string }) {
  if (deltas.length === 0) return <p className="kit-compare-empty">{empty}</p>;
  return (
    <ul className="kit-compare">
      {deltas.map((d) => (
        <li key={d.key} className={`delta-${d.direction}`}>
          <span>{d.label}</span>
          <b>{d.text}</b>
        </li>
      ))}
    </ul>
  );
}

/** Floating tooltip box anchored inside its (position: relative) parent. */
export function Tooltip({
  id,
  children,
  placement = 'top',
}: {
  id?: string;
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'right';
}) {
  return (
    <div id={id} role="tooltip" className={`kit-tooltip kit-tooltip-${placement}`}>
      {children}
    </div>
  );
}

/** Progress bar (XP / HP), accessible as a progressbar. */
export function ProgressBar({
  label,
  value,
  max,
  tone = 'xp',
  showText,
}: {
  label: string;
  value: number;
  max: number;
  tone?: 'xp' | 'hp' | 'gold';
  showText?: ReactNode;
}) {
  return (
    <div className={`kit-progress tone-${tone}`}>
      <div
        className="kit-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div style={{ width: `${progressFraction(value, max) * 100}%` }} />
      </div>
      {showText && <small className="kit-progress-text">{showText}</small>}
    </div>
  );
}

/** Gold badge: coin glyph + amount (accessible name «Gold: N»). */
export function CurrencyBadge({ amount, size = 'm' }: { amount: number; size?: 's' | 'm' | 'l' }) {
  return (
    <span className={`kit-currency kit-currency-${size}`} aria-label={EN.meta.gold(String(amount))}>
      <CurrencyIcon kind="gold" />
      {formatGold(amount)}
    </span>
  );
}

/** Task 19: ore («Ore») counter — a faceted ore crystal (original inline SVG) + amount. */
export function OreBadge({ amount, size = 'm' }: { amount: number; size?: 's' | 'm' | 'l' }) {
  return (
    <span
      className={`kit-currency kit-ore kit-currency-${size}`}
      aria-label={EN.meta.ore(String(amount))}
    >
      <CurrencyIcon kind="ore" />
      {formatGold(amount)}
    </span>
  );
}

/** Tier frame: coloured border, corner gem and tier glow around equipment content. */
export function TierFrame({
  tier,
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tier: number }) {
  return (
    <div {...rest} className={`kit-tier-frame tier-${tier} ${className}`}>
      <span className="kit-tier-gem" aria-hidden="true" />
      {children}
    </div>
  );
}
