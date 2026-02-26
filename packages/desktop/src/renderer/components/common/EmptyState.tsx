interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div
      style={{
        color: 'var(--text-dim)',
        textAlign: 'center',
        padding: '48px',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}
