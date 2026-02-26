import { useKernelStore } from '@/stores/useKernelStore';
import { useProjectStore } from '@/stores/useProjectStore';

/**
 * ConversationPanel — primary surface of the Archon shell.
 *
 * This is the operator-agent conversation interface. In v0.1 the conversation
 * store is not yet implemented; this component renders the visual structure
 * with an initial system message derived from live kernel status data.
 */
export function ConversationPanel() {
  const statusState = useKernelStore((s) => s.status);
  const { projects, activeProjectId } = useProjectStore();

  const rsHash =
    statusState.status === 'loaded' ? statusState.data.rsHash.slice(0, 8) : '—';

  const moduleCount =
    statusState.status === 'loaded' ? statusState.data.moduleCount : '—';

  const activeProject =
    projects.status === 'loaded'
      ? projects.data.find((p) => p.id === activeProjectId)
      : null;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Initial kernel system message */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: 'var(--green)' }}>Archon</span>
            <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
              {new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text)',
              lineHeight: 1.7,
            }}
          >
            {activeProject !== null && activeProject !== undefined ? (
              <>
                Project{' '}
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.9rem',
                    color: 'var(--white)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {activeProject.name}
                </span>{' '}
                initialized. Rule snapshot{' '}
                <span style={{ color: 'var(--blue)' }}>{rsHash}</span> active.{' '}
                {moduleCount} capability module{moduleCount === 1 ? '' : 's'}{' '}
                loaded. Governance enforcing.
              </>
            ) : (
              <>
                Kernel enforcing. Rule snapshot{' '}
                <span style={{ color: 'var(--blue)' }}>{rsHash}</span> active.
                No project selected.
              </>
            )}
          </div>
        </div>

        {/* Empty state hint */}
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid var(--border)',
            borderLeft: '2px solid var(--blue-dim)',
            background: 'var(--blue-glow)',
            fontSize: '0.68rem',
            color: 'var(--text-dim)',
            lineHeight: 1.7,
          }}
        >
          <span style={{ color: 'var(--blue)', letterSpacing: '0.1em' }}>
            v0.1
          </span>
          {'  '}
          Agent conversation surface — available in a future release. Governance
          proposals from agent processes appear in the{' '}
          <span style={{ color: 'var(--blue)' }}>Proposals</span> view and the
          approval banner above.
        </div>
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '0.75rem 1.2rem',
          background: 'var(--dark)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.6rem',
            border: '1px solid var(--border2)',
            background: 'var(--mid)',
            padding: '0.6rem 0.8rem',
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor =
              'var(--blue-dim)';
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor =
              'var(--border2)';
          }}
        >
          <textarea
            placeholder="Message the swarm…"
            rows={1}
            disabled
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: 'var(--white)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              outline: 'none',
              resize: 'none',
              minHeight: 20,
              maxHeight: 80,
              lineHeight: 1.5,
              cursor: 'not-allowed',
              opacity: 0.4,
            }}
          />
          <button
            disabled
            style={{
              background: 'var(--blue)',
              border: 'none',
              color: 'var(--black)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '0.35rem 0.8rem',
              cursor: 'not-allowed',
              opacity: 0.4,
              fontWeight: 500,
              flexShrink: 0,
              alignSelf: 'flex-end',
            }}
          >
            Send
          </button>
        </div>

        {/* Context meta */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '0.4rem',
            fontSize: '0.58rem',
            color: 'var(--text-dim)',
            letterSpacing: '0.08em',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--green)',
                }}
              />
              <span>Kernel enforcing</span>
            </div>
            <span style={{ color: 'var(--muted2)' }}>RS: {rsHash}</span>
          </div>
          <span>Conversation — v0.2</span>
        </div>
      </div>
    </div>
  );
}
