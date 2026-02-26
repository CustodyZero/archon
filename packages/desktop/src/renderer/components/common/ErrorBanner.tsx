interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      style={{
        background: 'rgba(207,102,121,0.1)',
        border: '1px solid var(--red)',
        borderRadius: 4,
        padding: '8px 12px',
        color: 'var(--red)',
        fontSize: 12,
        marginTop: 8,
      }}
    >
      {message}
    </div>
  );
}
