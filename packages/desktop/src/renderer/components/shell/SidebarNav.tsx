import { useNavigationStore } from '@/stores/useNavigationStore';
import type { DetailTab } from './DetailPanel';

interface SidebarNavProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

const NAV_ITEMS: Array<{ icon: string; label: string; tab: DetailTab }> = [
  { icon: '◈', label: 'Projects', tab: 'status' },
  { icon: '≡', label: 'Decision Log', tab: 'log' },
  { icon: '◻', label: 'Modules', tab: 'modules' },
];

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  const activeView = useNavigationStore((s) => s.activeView);
  const setView = useNavigationStore((s) => s.setView);

  function handleSelect(tab: DetailTab) {
    onTabChange(tab);
    // If currently viewing the proposals panel, exit it so the split layout
    // (ConversationPanel + DetailPanel) becomes visible.
    if (activeView === 'proposals') {
      setView('status');
    }
  }

  return (
    <nav
      style={{
        borderTop: '1px solid var(--border)',
        padding: '0.5rem 0',
        marginTop: 'auto',
      }}
    >
      {NAV_ITEMS.map(({ icon, label, tab }) => {
        const isActive = activeTab === tab && activeView !== 'proposals';
        return (
          <div
            key={tab}
            role="button"
            tabIndex={0}
            onClick={() => handleSelect(tab)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleSelect(tab);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.45rem 0.75rem',
              cursor: 'pointer',
              fontSize: '0.68rem',
              color: isActive ? 'var(--blue)' : 'var(--text-dim)',
              transition: 'color 0.15s, background 0.15s',
              userSelect: 'none',
              border: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-mono)',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background =
                  'var(--mid)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = isActive
                ? 'var(--blue)'
                : 'var(--text-dim)';
            }}
          >
            <span
              style={{
                width: 14,
                textAlign: 'center',
                fontSize: '0.7rem',
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
            <span>{label}</span>
          </div>
        );
      })}
    </nav>
  );
}
