interface PulsingDotProps {
  color?: string;
  size?: number;
}

export function PulsingDot({ color = 'var(--blue)', size = 6 }: PulsingDotProps) {
  return (
    <div
      className="anim-pulse-dot"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
