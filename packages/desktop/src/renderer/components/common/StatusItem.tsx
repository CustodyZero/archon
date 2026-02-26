import type { CSSProperties } from 'react';

interface StatusItemProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function StatusItem({ children, style }: StatusItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
