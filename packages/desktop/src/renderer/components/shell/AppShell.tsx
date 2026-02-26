import { useState, useEffect } from 'react';
import { useNavigationStore } from '@/stores/useNavigationStore';
import { TitleBar } from './TitleBar';
import { ApprovalBanner } from './ApprovalBanner';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ProjectHeader } from './ProjectHeader';
import { ConversationPanel } from './ConversationPanel';
import { DetailPanel } from './DetailPanel';
import type { DetailTab } from './DetailPanel';
import { ProposalView } from '@/components/proposals/ProposalView';

/**
 * AppShell — top-level shell layout.
 *
 * Layout (top-to-bottom, full height):
 *   TitleBar          32px  — always present
 *   ApprovalBanner    40px  — conditional; appears when pending proposals exist
 *   AppBody           flex  — Sidebar (220px) + MainArea (flex:1)
 *     Sidebar               — Projects section, Modules section, SidebarNav
 *     MainArea              — ProjectHeader (44px) + content
 *       ProjectHeader       — active project name, meta, actions
 *       ProposalView        — shown when activeView === 'proposals'
 *       SplitView           — shown otherwise: ConversationPanel + DetailPanel
 *   StatusBar         26px  — always present
 *
 * The SidebarNav drives the detail panel tab (local state).
 * The global navigation store drives proposal vs. split-view routing.
 */
export function AppShell() {
  const [detailTab, setDetailTab] = useState<DetailTab>('status');
  const activeView = useNavigationStore((s) => s.activeView);
  const setView = useNavigationStore((s) => s.setView);

  // The navigation store initialises to 'proposals', but the split layout
  // (ConversationPanel + DetailPanel) is the primary surface on startup.
  // Override the default once on mount so the correct view is shown immediately.
  // This calls a store action — it does not change store logic.
  useEffect(() => {
    setView('status');
  }, []);

  // Show proposals view only when explicitly navigated there (e.g. via ApprovalBanner).
  const showProposalView = activeView === 'proposals';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--black)',
        overflow: 'hidden',
      }}
    >
      <TitleBar />
      <ApprovalBanner />

      {/* App body: Sidebar + MainArea */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar activeTab={detailTab} onTabChange={setDetailTab} />

        {/* MainArea: ProjectHeader + content */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--black)',
          }}
        >
          <ProjectHeader />

          {showProposalView ? (
            /* Proposals view — fills remaining main area */
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ProposalView />
            </div>
          ) : (
            /* Split view: ConversationPanel (primary) + DetailPanel (280px) */
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <ConversationPanel />
              <DetailPanel activeTab={detailTab} onTabChange={setDetailTab} />
            </div>
          )}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
