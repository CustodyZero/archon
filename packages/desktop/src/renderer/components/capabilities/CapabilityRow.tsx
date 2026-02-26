import { useState } from 'react';
import type { CapabilityEntry } from '@/types/api';
import { useProposalStore } from '@/stores/useProposalStore';
import { TierBadge } from './TierBadge';

interface CapabilityRowProps {
  capability: CapabilityEntry;
}

export function CapabilityRow({ capability }: CapabilityRowProps) {
  const [proposing, setProposing] = useState(false);
  const propose = useProposalStore((s) => s.propose);

  const handleToggle = async () => {
    setProposing(true);
    try {
      await propose(
        capability.enabled
          ? { kind: 'disable_capability', capabilityType: capability.type }
          : { kind: 'enable_capability', capabilityType: capability.type },
        { kind: 'ui', id: 'operator' },
      );
    } finally {
      setProposing(false);
    }
  };

  const isTier3 = capability.tier === 'T3';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 60px 80px 120px 130px',
        alignItems: 'center',
        gap: 12,
        padding: '9px 16px',
        borderBottom: '1px solid var(--border)',
        background: isTier3 ? 'rgba(207,102,121,0.03)' : 'transparent',
        borderLeft: isTier3 ? '2px solid rgba(207,102,121,0.2)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <span
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}
      >
        {capability.type}
      </span>
      <TierBadge tier={capability.tier} />
      <span
        style={{
          fontSize: 11,
          color: capability.enabled ? 'var(--green)' : 'var(--text-dim)',
          letterSpacing: '0.04em',
        }}
      >
        {capability.enabled ? '\u25cf Enabled' : '\u25cb Disabled'}
      </span>
      <span
        style={{
          fontSize: 10,
          color: capability.ackRequired ? 'var(--amber)' : 'var(--text-dim)',
        }}
      >
        {capability.ackRequired ? '\u26a0 ACK required' : ''}
      </span>
      <button
        onClick={() => void handleToggle()}
        disabled={proposing}
        style={{
          background: 'transparent',
          border: `1px solid ${capability.enabled ? 'rgba(207,102,121,0.35)' : 'rgba(79,195,247,0.35)'}`,
          color: capability.enabled ? 'var(--red)' : 'var(--blue)',
          cursor: proposing ? 'default' : 'pointer',
          padding: '3px 10px',
          fontSize: 10,
          borderRadius: 3,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          opacity: proposing ? 0.5 : 1,
          transition: 'all 0.15s',
        }}
      >
        {proposing ? '\u2026' : capability.enabled ? 'Propose Disable' : 'Propose Enable'}
      </button>
    </div>
  );
}
