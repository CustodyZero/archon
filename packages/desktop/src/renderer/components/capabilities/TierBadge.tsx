import type { RiskTier } from '@/types/api';

const TIER_COLORS: Record<RiskTier, { color: string; border: string; bg: string }> = {
  T0: { color: 'var(--text-dim)', border: 'var(--border)', bg: 'transparent' },
  T1: { color: 'var(--text)', border: 'var(--border2)', bg: 'transparent' },
  T2: { color: 'var(--amber)', border: 'rgba(212,136,10,0.3)', bg: 'rgba(212,136,10,0.06)' },
  T3: { color: 'var(--red)', border: 'rgba(207,102,121,0.3)', bg: 'rgba(207,102,121,0.08)' },
};

interface TierBadgeProps {
  tier: RiskTier;
}

export function TierBadge({ tier }: TierBadgeProps) {
  const c = TIER_COLORS[tier];
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {tier}
    </span>
  );
}
