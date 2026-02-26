import type { RiskTier } from '@/types/api';

const TIERS: Array<RiskTier | null> = [null, 'T0', 'T1', 'T2', 'T3'];
const TIER_LABELS: Record<string, string> = { T0: 'T0', T1: 'T1', T2: 'T2', T3: 'T3' };

interface TierFilterProps {
  selected: RiskTier | null;
  onSelect: (t: RiskTier | null) => void;
}

export function TierFilter({ selected, onSelect }: TierFilterProps) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {TIERS.map((t) => (
        <button
          key={t ?? 'all'}
          onClick={() => onSelect(t)}
          style={{
            background: selected === t ? 'var(--blue-glow)' : 'transparent',
            border: '1px solid',
            borderColor: selected === t ? 'var(--blue)' : 'var(--border)',
            color: selected === t ? 'var(--blue)' : 'var(--text-dim)',
            cursor: 'pointer',
            padding: '3px 10px',
            fontSize: 11,
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
            transition: 'all 0.1s',
          }}
        >
          {t === null ? 'All' : TIER_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
