import type { CSSProperties } from 'react';

interface LogoBaseProps {
  size?: number;
  className?: string;
}

interface LogoFullProps extends LogoBaseProps {
  textClassName?: string;
}

export function LogoMark({ size = 24, className = '' }: LogoBaseProps) {
  return (
    <span
      className={`scg-ai-logo ${className}`}
      style={{ '--logo-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="scg-ai-core-ring">
        <span className="scg-ai-core-dot" />
      </span>

      <span className="scg-ai-orbit scg-ai-orbit-a">
        <span className="scg-ai-node scg-ai-node-top" />
        <span className="scg-ai-node scg-ai-node-bottom" />
      </span>

      <span className="scg-ai-orbit scg-ai-orbit-b">
        <span className="scg-ai-node scg-ai-node-left" />
        <span className="scg-ai-node scg-ai-node-right" />
      </span>
    </span>
  );
}

export function LogoFull({ size = 36, className = '', textClassName = '' }: LogoFullProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <span
        className={`leading-none font-semibold tracking-tight text-[#7b78ef] ${textClassName}`}
        style={{ fontSize: Math.round(size * 0.9) } as CSSProperties}
      >
        SCG AI
      </span>
    </span>
  );
}
