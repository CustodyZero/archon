interface HazardWarningsProps {
  hazards: ReadonlyArray<readonly [string, string]>;
  confirmed: ReadonlyArray<readonly [string, string]>;
  onConfirm: (pair: readonly [string, string]) => void;
}

export function HazardWarnings({ hazards, confirmed, onConfirm }: HazardWarningsProps) {
  return (
    <div
      style={{
        background: 'rgba(207,102,121,0.06)',
        border: '1px solid rgba(207,102,121,0.25)',
        borderRadius: 4,
        padding: '12px 14px',
        marginBottom: 16,
      }}
    >
      <div style={{ color: 'var(--red)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Hazard Combinations Triggered
      </div>
      {hazards.map(([a, b]) => {
        const isConfirmed = confirmed.some(([ca, cb]) => ca === a && cb === b);
        return (
          <div
            key={`${a}+${b}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              marginBottom: 6,
              background: isConfirmed ? 'rgba(129,199,132,0.06)' : 'var(--mid)',
              border: `1px solid ${isConfirmed ? 'rgba(129,199,132,0.2)' : 'var(--border)'}`,
              borderRadius: 3,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: 'var(--dark)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '2px 8px',
                  borderRadius: 3,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {a}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>+</span>
              <span
                style={{
                  background: 'var(--dark)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '2px 8px',
                  borderRadius: 3,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {b}
              </span>
            </div>
            <button
              onClick={() => onConfirm([a, b])}
              disabled={isConfirmed}
              style={{
                background: isConfirmed ? 'rgba(129,199,132,0.12)' : 'transparent',
                border: `1px solid ${isConfirmed ? 'var(--green)' : 'var(--red)'}`,
                color: isConfirmed ? 'var(--green)' : 'var(--red)',
                cursor: isConfirmed ? 'default' : 'pointer',
                padding: '3px 10px',
                fontSize: 10,
                borderRadius: 3,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}
            >
              {isConfirmed ? '✓ Acknowledged' : 'Acknowledge risk'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
