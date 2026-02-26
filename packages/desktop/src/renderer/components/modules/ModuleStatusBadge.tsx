interface ModuleStatusBadgeProps {
  status: string;
}

export function ModuleStatusBadge({ status }: ModuleStatusBadgeProps) {
  const isEnabled = status === 'Enabled';
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        background: isEnabled ? 'rgba(129,199,132,0.12)' : 'transparent',
        border: `1px solid ${isEnabled ? 'rgba(129,199,132,0.3)' : 'var(--border)'}`,
        color: isEnabled ? 'var(--green)' : 'var(--text-dim)',
      }}
    >
      {status}
    </span>
  );
}
