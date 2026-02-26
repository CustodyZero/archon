import { motion, AnimatePresence } from 'framer-motion';
import type { ProjectRecord } from '@/types/api';

interface ProjectItemProps {
  project: ProjectRecord;
  isActive: boolean;
  onSelect: () => void;
}

export function ProjectItem({ project, isActive, onSelect }: ProjectItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.45rem 0.75rem',
        cursor: 'pointer',
        position: 'relative',
        background: isActive ? 'rgba(79,195,247,0.08)' : 'transparent',
        transition: 'background 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'var(--mid)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = isActive
          ? 'rgba(79,195,247,0.08)'
          : 'transparent';
      }}
    >
      {/* Active left edge indicator — animates between projects */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            layoutId="active-project-indicator"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--blue)',
              transformOrigin: 'top',
            }}
          />
        )}
      </AnimatePresence>

      {/* Project status dot */}
      <div
        className={isActive ? 'anim-pulse-dot' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isActive ? 'var(--blue)' : 'var(--muted2)',
          flexShrink: 0,
        }}
      />

      {/* Project name */}
      <span
        style={{
          fontSize: '0.72rem',
          color: isActive ? 'var(--white)' : 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {project.name}
      </span>
    </div>
  );
}
