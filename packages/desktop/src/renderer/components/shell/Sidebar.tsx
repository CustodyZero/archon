import { ProjectList } from './ProjectList';
import { ModuleList } from './ModuleList';
import { SidebarNav } from './SidebarNav';
import type { DetailTab } from './DetailPanel';

interface SidebarProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--dark)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Scrollable sections: Projects and Modules */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <ProjectList />
        <ModuleList />
      </div>

      {/* Nav at bottom — drives detail panel tab */}
      <SidebarNav activeTab={activeTab} onTabChange={onTabChange} />
    </aside>
  );
}
