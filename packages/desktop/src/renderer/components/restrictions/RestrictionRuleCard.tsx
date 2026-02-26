interface RestrictionRuleCardProps {
  rule: Record<string, unknown>;
  index: number;
}

export function RestrictionRuleCard({ rule, index }: RestrictionRuleCardProps) {
  const capabilityType =
    typeof rule['capabilityType'] === 'string' ? rule['capabilityType'] : '\u2014';
  const effect = typeof rule['effect'] === 'string' ? rule['effect'] : '\u2014';
  const isAllow = effect === 'allow';

  return (
    <div
      style={{
        background: 'var(--mid)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '12px 14px',
        borderLeft: `2px solid ${isAllow ? 'var(--green)' : 'var(--red)'}`,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
      >
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}
        >
          {capabilityType}
        </span>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.06em',
            background: isAllow ? 'rgba(129,199,132,0.1)' : 'rgba(207,102,121,0.1)',
            border: `1px solid ${isAllow ? 'rgba(129,199,132,0.3)' : 'rgba(207,102,121,0.3)'}`,
            color: isAllow ? 'var(--green)' : 'var(--red)',
          }}
        >
          {effect}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
          Rule #{index + 1}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {JSON.stringify(rule, null, 0).slice(0, 200)}
      </div>
    </div>
  );
}
