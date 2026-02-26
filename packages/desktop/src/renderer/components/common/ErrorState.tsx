interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{ color: 'var(--red)', padding: '24px', fontSize: 12 }}>
      <div>{message}</div>
      {onRetry !== undefined && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 8,
            background: 'transparent',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            cursor: 'pointer',
            padding: '4px 10px',
            fontSize: 11,
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
