import type { ProposalChange } from '@/types/api';

interface ProposalChangeSummaryProps { change: ProposalChange }

export function ProposalChangeSummary({ change }: ProposalChangeSummaryProps) {
  const rows = getChangeRows(change);

  return (
    <div
      style={{
        background: 'var(--mid)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '12px 14px',
        marginBottom: 16,
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Change Details
      </div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', marginBottom: 4 }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{label}</span>
          <span style={{ color: 'var(--text)', fontSize: 11, wordBreak: 'break-all' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function getChangeRows(change: ProposalChange): Array<[string, string]> {
  switch (change.kind) {
    case 'enable_capability':
      return [['Kind', 'Enable Capability'], ['Type', change.capabilityType]];
    case 'disable_capability':
      return [['Kind', 'Disable Capability'], ['Type', change.capabilityType]];
    case 'enable_module':
      return [['Kind', 'Enable Module'], ['Module ID', change.moduleId]];
    case 'disable_module':
      return [['Kind', 'Disable Module'], ['Module ID', change.moduleId]];
    case 'set_restrictions':
      return [['Kind', 'Set Restrictions'], ['Count', String(change.rules.length)]];
    case 'set_project_fs_roots':
      return [['Kind', 'Set FS Roots'], ['Roots', change.roots.map((r) => r.id).join(', ')]];
    case 'set_project_net_allowlist':
      return [['Kind', 'Set Net Allowlist'], ['Allowlist', change.allowlist.join(', ')]];
    case 'set_project_exec_root':
      return [['Kind', 'Set Exec Root'], ['Root ID', change.rootId ?? '(workspace default)']];
    case 'set_secret':
      // change.value is redacted by the kernel before persisting — never displayed.
      return [['Kind', 'Set Secret'], ['Key', change.key]];
    case 'delete_secret':
      return [['Kind', 'Delete Secret'], ['Key', change.key]];
    case 'set_secret_mode':
      return [['Kind', 'Set Secret Mode'], ['Mode', change.mode]];
    default:
      return [['Kind', (change as { kind: string }).kind]];
  }
}
