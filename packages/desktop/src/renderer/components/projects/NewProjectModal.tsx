import { motion, AnimatePresence } from 'framer-motion';
import { NewProjectForm } from './NewProjectForm';

interface NewProjectModalProps {
  onClose: () => void;
}

export function NewProjectModal({ onClose }: NewProjectModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10,10,10,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--dark)',
            border: '1px solid var(--panel-border)',
            borderRadius: 6,
            padding: '24px',
            width: 400,
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                letterSpacing: '0.08em',
                color: 'var(--light)',
              }}
            >
              NEW PROJECT
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: 16,
                padding: 4,
              }}
            >
              \u2715
            </button>
          </div>
          <NewProjectForm onCreated={onClose} />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
