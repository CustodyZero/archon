import { type CSSProperties } from 'react';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Panel({ children, className, style }: PanelProps) {
  const cornerStyle: CSSProperties = {
    position: 'absolute',
    width: 8,
    height: 8,
    pointerEvents: 'none',
  };

  return (
    <div
      style={{ position: 'relative', ...style }}
      className={className}
    >
      {/* Top-left bracket */}
      <div
        style={{
          ...cornerStyle,
          top: -1,
          left: -1,
          borderTop: '1px solid var(--blue)',
          borderLeft: '1px solid var(--blue)',
        }}
      />
      {/* Bottom-right bracket */}
      <div
        style={{
          ...cornerStyle,
          bottom: -1,
          right: -1,
          borderBottom: '1px solid var(--blue)',
          borderRight: '1px solid var(--blue)',
        }}
      />
      {children}
    </div>
  );
}
