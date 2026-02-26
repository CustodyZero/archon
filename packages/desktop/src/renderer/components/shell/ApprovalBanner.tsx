import { AnimatePresence, motion } from 'framer-motion';
import { useProposalStore } from '@/stores/useProposalStore';
import { useNavigationStore } from '@/stores/useNavigationStore';

export function ApprovalBanner() {
  const proposals = useProposalStore((s) => s.proposals);
  const setView = useNavigationStore((s) => s.setView);
  const selectProposal = useProposalStore((s) => s.selectProposal);

  const pending =
    proposals.status === 'loaded'
      ? proposals.data.filter((p) => p.status === 'pending')
      : [];

  const first = pending[0];

  return (
    <AnimatePresence>
      {first !== undefined && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 40, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          {/* Inner container carries the background pulse via CSS class */}
          <div
            className="anim-banner-bg"
            style={{
              height: 40,
              borderBottom: '1px solid var(--panel-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              paddingLeft: '1.2rem',
              paddingRight: '1.2rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Left blue edge bar — 3px solid --blue */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: 'var(--blue)',
                flexShrink: 0,
              }}
            />

            {/* Pulsing blue dot */}
            <div
              className="anim-pulse-dot"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--blue)',
                flexShrink: 0,
              }}
            />

            {/* Banner text */}
            <div
              style={{
                flex: 1,
                fontSize: '0.7rem',
                color: 'var(--blue)',
                letterSpacing: '0.08em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {'Pending approval — '}
              <span style={{ color: 'var(--white)' }}>
                {first.createdBy.id}
              </span>
              {' '}
              <span style={{ color: 'var(--white)' }}>
                {first.changeSummary}
              </span>
              {pending.length > 1 && (
                <span style={{ color: 'var(--blue)', marginLeft: 6 }}>
                  +{pending.length - 1} more
                </span>
              )}
            </div>

            {/* Review button only — operator must read before approving */}
            <button
              onClick={() => {
                setView('proposals');
                void selectProposal(first.id);
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                background: 'transparent',
                border: '1px solid var(--blue-dim)',
                color: 'var(--blue)',
                padding: '0.3rem 0.8rem',
                cursor: 'pointer',
                transition: 'background 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'rgba(79,195,247,0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'transparent';
              }}
            >
              Review
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
