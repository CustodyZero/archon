import { useState } from 'react';
import { useProposalStore } from '@/stores/useProposalStore';

interface ModuleToggleButtonProps {
  moduleId: string;
  isEnabled: boolean;
}

export function ModuleToggleButton({ moduleId, isEnabled }: ModuleToggleButtonProps) {
  const [proposing, setProposing] = useState(false);
  const propose = useProposalStore((s) => s.propose);

  const handleToggle = async () => {
    setProposing(true);
    try {
      await propose(
        isEnabled
          ? { kind: 'disable_module', moduleId }
          : { kind: 'enable_module', moduleId },
        { kind: 'ui', id: 'operator' },
      );
    } finally {
      setProposing(false);
    }
  };

  return (
    <button
      onClick={() => void handleToggle()}
      disabled={proposing}
      style={{
        background: 'transparent',
        border: `1px solid ${isEnabled ? 'rgba(207,102,121,0.35)' : 'rgba(79,195,247,0.35)'}`,
        color: isEnabled ? 'var(--red)' : 'var(--blue)',
        cursor: proposing ? 'default' : 'pointer',
        padding: '4px 12px',
        fontSize: 11,
        borderRadius: 3,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        opacity: proposing ? 0.5 : 1,
        transition: 'all 0.15s',
        marginTop: 12,
      }}
    >
      {proposing ? 'Proposing\u2026' : isEnabled ? 'Propose Disable' : 'Propose Enable'}
    </button>
  );
}
