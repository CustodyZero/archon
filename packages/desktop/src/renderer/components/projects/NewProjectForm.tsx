import { useState } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';

interface NewProjectFormProps {
  onCreated?: () => void;
}

export function NewProjectForm({ onCreated }: NewProjectFormProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createProject = useProjectStore((s) => s.createProject);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      await createProject(trimmed);
      setName('');
      onCreated?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        background: 'var(--mid)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '16px',
        marginTop: 16,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 12 }}>
        Create new project
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate();
        }}
        placeholder="Project name"
        style={{
          width: '100%',
          background: 'var(--dark)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '7px 10px',
          borderRadius: 3,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          marginBottom: 10,
          boxSizing: 'border-box',
        }}
      />
      {error !== null && (
        <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{error}</div>
      )}
      <button
        onClick={() => void handleCreate()}
        disabled={creating || name.trim().length === 0}
        style={{
          background: 'var(--blue-glow)',
          border: '1px solid var(--panel-border)',
          color: 'var(--blue)',
          cursor: creating || name.trim().length === 0 ? 'default' : 'pointer',
          padding: '6px 16px',
          fontSize: 12,
          borderRadius: 3,
          fontFamily: 'var(--font-mono)',
          opacity: creating || name.trim().length === 0 ? 0.5 : 1,
          transition: 'opacity 0.1s',
        }}
      >
        {creating ? 'Creating\u2026' : 'Create Project'}
      </button>
    </div>
  );
}
