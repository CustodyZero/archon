import { motion, AnimatePresence } from 'framer-motion';
import { useKernelStore } from '@/stores/useKernelStore';
import type { DecisionEntry } from '@/stores/useKernelStore';
import { useProposalStore } from '@/stores/useProposalStore';
import { useState } from 'react';

export type DetailTab = 'status' | 'modules' | 'log';

interface DetailPanelProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

// ── Status Tab ──────────────────────────────────────────────────────────────

function StatusTabContent() {
  const statusState = useKernelStore((s) => s.status);
  const driftState = useKernelStore((s) => s.drift);
  const proposals = useProposalStore((s) => s.proposals);

  const pendingCount =
    proposals.status === 'loaded'
      ? proposals.data.filter((p) => p.status === 'pending').length
      : 0;

  const panelStyle: React.CSSProperties = {
    padding: '0.8rem',
    borderBottom: '1px solid var(--border)',
    position: 'relative',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.55rem',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'var(--blue)',
    marginBottom: '0.6rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.28rem 0',
    borderBottom: '1px solid rgba(36,36,36,0.5)',
    fontSize: '0.65rem',
  };

  const keyStyle: React.CSSProperties = { color: 'var(--text-dim)' };

  const rsHash =
    statusState.status === 'loaded'
      ? statusState.data.rsHash.slice(0, 8)
      : '—';

  const moduleCount =
    statusState.status === 'loaded' ? statusState.data.moduleCount : '—';

  const ruleCount =
    statusState.status === 'loaded' ? statusState.data.restrictionCount : '—';

  const driftLevel =
    driftState.status === 'loaded' ? driftState.data.status : 'none';

  const driftColor =
    driftLevel === 'conflict'
      ? 'var(--red)'
      : driftLevel === 'unknown'
        ? 'var(--amber)'
        : 'var(--green)';

  const driftDisplay =
    driftLevel === 'none' ? 'None' : driftLevel;

  return (
    <>
      {/* Kernel panel */}
      <div style={panelStyle}>
        <div style={labelStyle}>
          Kernel
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.58rem',
              color: 'var(--blue)',
            }}
          >
            <div
              className="anim-enforce"
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--blue)',
              }}
            />
            <span>Enforcing</span>
          </div>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>Mode</span>
          <span style={{ color: 'var(--blue)', fontSize: '0.65rem' }}>
            Deterministic
          </span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>Modules</span>
          <span style={{ color: 'var(--text)', fontSize: '0.65rem' }}>
            {moduleCount}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>Rules</span>
          <span style={{ color: 'var(--text)', fontSize: '0.65rem' }}>
            {ruleCount}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>Drift</span>
          <span style={{ color: driftColor, fontSize: '0.65rem' }}>
            {driftDisplay}
          </span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={keyStyle}>Snapshot</span>
          <span
            style={{
              color: 'var(--blue-dim)',
              fontSize: '0.6rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rsHash}
          </span>
        </div>
      </div>

      {/* Proposals panel */}
      <div style={panelStyle}>
        <div style={labelStyle}>Proposals</div>
        <div style={rowStyle}>
          <span style={keyStyle}>Pending</span>
          <span
            style={{
              color: pendingCount > 0 ? 'var(--amber)' : 'var(--text)',
              fontSize: '0.65rem',
            }}
          >
            {pendingCount}
          </span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={keyStyle}>Total loaded</span>
          <span style={{ color: 'var(--text)', fontSize: '0.65rem' }}>
            {proposals.status === 'loaded' ? proposals.data.length : '—'}
          </span>
        </div>
      </div>
    </>
  );
}

// ── Modules Tab ─────────────────────────────────────────────────────────────

function ModulesTabContent() {
  const modules = useKernelStore((s) => s.modules);

  if (modules.status !== 'loaded') {
    return (
      <div
        style={{
          padding: '1.5rem 0.8rem',
          fontSize: '0.65rem',
          color: 'var(--text-dim)',
          textAlign: 'center',
        }}
      >
        {modules.status === 'loading' ? 'Loading…' : 'No data'}
      </div>
    );
  }

  return (
    <>
      {modules.data.map((m) => {
        const isEnabled = m.status === 'Enabled';
        return (
          <div
            key={m.module_id}
            style={{
              padding: '0.7rem 0.8rem',
              borderBottom: '1px solid var(--border)',
              position: 'relative',
              cursor: 'pointer',
            }}
          >
            {/* Active left bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 2,
                background: isEnabled ? 'var(--blue)' : 'var(--muted2)',
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.3rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  color: isEnabled ? 'var(--white)' : 'var(--text-dim)',
                  fontWeight: 500,
                }}
              >
                {m.module_name}
              </span>
              {/* Toggle pill — visual only */}
              <div
                style={{
                  width: 26,
                  height: 14,
                  borderRadius: 7,
                  background: isEnabled ? 'var(--blue-dim)' : 'var(--muted)',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--white)',
                    top: 2,
                    left: isEnabled ? 14 : 2,
                    transition: 'left 0.2s',
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>
              {m.description}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Log Tab ─────────────────────────────────────────────────────────────────

function DecisionRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: DecisionEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const decision = entry.decision ?? '?';
  const isPermit = decision === 'Permit';
  const capType = entry.capabilityType ?? '?';
  const agentId = entry.agentId ?? entry.agent_id ?? '?';
  const ts = entry.timestamp ?? '?';
  const timeStr = ts !== '?' ? ts.replace('T', ' ').slice(0, 19) : '?';

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.8rem',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
            background: isPermit ? 'var(--green)' : 'var(--red)',
          }}
        />
        <span
          style={{
            fontSize: '0.58rem',
            color: isPermit ? 'var(--green)' : 'var(--red)',
            fontWeight: 600,
            width: 38,
            flexShrink: 0,
          }}
        >
          {decision}
        </span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text)', flex: 1 }}>
          {String(capType)}
        </span>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>
          {isExpanded ? '\u25b4' : '\u25be'}
        </span>
      </div>
      {isExpanded && (
        <div
          style={{
            padding: '0.3rem 0.8rem 0.6rem',
            fontSize: '0.58rem',
            color: 'var(--text-dim)',
            lineHeight: 1.8,
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          <div><span style={{ color: 'var(--text-dim)' }}>Time:</span> {timeStr}</div>
          <div><span style={{ color: 'var(--text-dim)' }}>Agent:</span> {String(agentId)}</div>
          <div><span style={{ color: 'var(--text-dim)' }}>RS:</span> {String(entry.rs_hash ?? '?').slice(0, 16)}...</div>
          {entry.reason && entry.reason !== 'none' && (
            <div><span style={{ color: 'var(--text-dim)' }}>Rules:</span> {String(entry.reason)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function LogTabContent() {
  const decisionsState = useKernelStore((s) => s.decisions);
  const fetchDecisions = useKernelStore((s) => s.fetchDecisions);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);

  if (decisionsState.status === 'idle') {
    void fetchDecisions();
  }

  if (decisionsState.status === 'loading' || decisionsState.status === 'idle') {
    return (
      <div style={{ padding: '1.5rem 0.8rem', fontSize: '0.65rem', color: 'var(--text-dim)', textAlign: 'center' }}>
        Loading...
      </div>
    );
  }

  if (decisionsState.status === 'error') {
    return (
      <div style={{ padding: '1.5rem 0.8rem', fontSize: '0.65rem', color: 'var(--red)', textAlign: 'center' }}>
        {decisionsState.error}
      </div>
    );
  }

  const allEntries = decisionsState.data;

  // Filter governance.decision events only
  const decisionEntries = allEntries.filter((e) =>
    e.event_type === 'governance.decision' || e.decision !== undefined,
  );

  const filtered = outcomeFilter !== null
    ? decisionEntries.filter((e) => e.decision === outcomeFilter)
    : decisionEntries;

  // Reverse: most recent first
  const sorted = [...filtered].reverse();

  if (decisionEntries.length === 0) {
    return (
      <div style={{ padding: '1.5rem 0.8rem', fontSize: '0.65rem', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.7 }}>
        <div style={{ color: 'var(--muted2)', marginBottom: '0.4rem' }}>{'\u2261'}</div>
        No decision log entries yet.
        <div style={{ marginTop: '0.3rem', fontSize: '0.55rem' }}>
          Run an action through the gate to generate entries.
        </div>
      </div>
    );
  }

  const permitCount = decisionEntries.filter((e) => e.decision === 'Permit').length;
  const denyCount = decisionEntries.filter((e) => e.decision === 'Deny').length;

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: '0.55rem',
    padding: '0.2rem 0.5rem',
    border: '1px solid var(--border)',
    borderRadius: 3,
    cursor: 'pointer',
    background: active ? 'var(--blue-dim)' : 'transparent',
    color: active ? 'var(--blue)' : 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
  });

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.3rem', padding: '0.5rem 0.8rem', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <button style={filterBtnStyle(outcomeFilter === null)} onClick={() => setOutcomeFilter(null)}>
          All ({decisionEntries.length})
        </button>
        <button style={filterBtnStyle(outcomeFilter === 'Permit')} onClick={() => setOutcomeFilter(outcomeFilter === 'Permit' ? null : 'Permit')}>
          Permit ({permitCount})
        </button>
        <button style={filterBtnStyle(outcomeFilter === 'Deny')} onClick={() => setOutcomeFilter(outcomeFilter === 'Deny' ? null : 'Deny')}>
          Deny ({denyCount})
        </button>
      </div>
      {/* Entries */}
      {sorted.map((entry) => (
        <DecisionRow
          key={entry.event_id}
          entry={entry}
          isExpanded={expandedId === entry.event_id}
          onToggle={() => setExpandedId(expandedId === entry.event_id ? null : entry.event_id)}
        />
      ))}
    </>
  );
}

// ── Tab Bar ─────────────────────────────────────────────────────────────────

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'modules', label: 'Modules' },
  { id: 'log', label: 'Log' },
];

// ── DetailPanel ──────────────────────────────────────────────────────────────

export function DetailPanel({ activeTab, onTabChange }: DetailPanelProps) {
  return (
    <div
      style={{
        width: 280,
        background: 'var(--dark)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            style={{
              flex: 1,
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: activeTab === id ? 'var(--blue)' : 'var(--text-dim)',
              padding: '0.6rem 0',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === id ? 'var(--blue)' : 'transparent'}`,
              fontFamily: 'var(--font-mono)',
              position: 'relative',
              transition: 'color 0.15s',
            }}
          >
            {activeTab === id && (
              <motion.div
                layoutId="detail-tab-indicator"
                style={{
                  position: 'absolute',
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: 'var(--blue)',
                }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {activeTab === 'status' && <StatusTabContent />}
            {activeTab === 'modules' && <ModulesTabContent />}
            {activeTab === 'log' && <LogTabContent />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
