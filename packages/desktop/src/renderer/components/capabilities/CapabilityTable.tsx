import type { CapabilityEntry, RiskTier } from '@/types/api';
import { CapabilityRow } from './CapabilityRow';

interface CapabilityTableProps {
  capabilities: CapabilityEntry[];
  tierFilter: RiskTier | null;
}

export function CapabilityTable({ capabilities, tierFilter }: CapabilityTableProps) {
  const filtered =
    tierFilter !== null
      ? capabilities.filter((c) => c.tier === tierFilter)
      : capabilities;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 80px 120px 130px',
          gap: 12,
          padding: '8px 16px',
          background: 'var(--dark)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {['Type', 'Tier', 'Status', 'Notes', 'Action'].map((h) => (
          <span
            key={h}
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {filtered.map((cap) => (
        <CapabilityRow key={cap.type} capability={cap} />
      ))}
      {filtered.length === 0 && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: 12,
          }}
        >
          No capabilities in this tier
        </div>
      )}
    </div>
  );
}
