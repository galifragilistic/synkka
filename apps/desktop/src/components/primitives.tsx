import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { icons, type IconName } from '@synkka/core';

export function Icon({ name, size = 18, strokeWidth = 2 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name].map((s, i) =>
        s.type === 'path' ? (
          <path key={i} d={s.d} />
        ) : s.type === 'circle' ? (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
        ) : (
          <rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} />
        ),
      )}
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm' | 'lg';
  icon?: IconName;
  children?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className="btn btn--secondary btn--icon" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  );
}

export function ProgressBar({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'success'; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div className={`progress__fill progress__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function RadioCard({
  name, value, checked, onChange, icon, title, meta,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  icon: IconName;
  title: string;
  meta: string;
}) {
  return (
    <label className={`radio-card ${checked ? 'radio-card--selected' : ''}`}>
      <input
        className="visually-hidden"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="radio-card__ring" aria-hidden="true">
        <span className="radio-card__dot" />
      </span>
      <span className="icon-tile icon-tile--40" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className="radio-card__text">
        <span className="radio-card__title">{title}</span>
        <span className="radio-card__meta">{meta}</span>
      </span>
    </label>
  );
}
