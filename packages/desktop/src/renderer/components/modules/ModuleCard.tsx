import { motion } from 'framer-motion';
import type { ModuleSummary } from '@/types/api';
import { ModuleStatusBadge } from './ModuleStatusBadge';
import { ModuleToggleButton } from './ModuleToggleButton';

interface ModuleCardProps {
  module: ModuleSummary;
}

export function ModuleCard({ module }: ModuleCardProps) {
  const isEnabled = module.status === 'Enabled';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{
        background: 'var(--mid)',
        border: `1px solid ${isEnabled ? 'var(--panel-border)' : 'var(--border)'}`,
        borderRadius: 4,
        padding: '16px',
        position: 'relative',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Left active bar */}
      <motion.div
        initial={false}
        animate={{ scaleY: isEnabled ? 1 : 0 }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: 'var(--blue)',
          transformOrigin: 'top',
          borderTopLeftRadius: 4,
          borderBottomLeftRadius: 4,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--light)',
              fontWeight: 500,
              marginBottom: 3,
            }}
          >
            {module.module_name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            v{module.version}
          </div>
        </div>
        <ModuleStatusBadge status={module.status} />
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-dim)',
          lineHeight: 1.5,
          marginBottom: 4,
        }}
      >
        {module.description}
      </div>
      <ModuleToggleButton moduleId={module.module_id} isEnabled={isEnabled} />
    </motion.div>
  );
}
