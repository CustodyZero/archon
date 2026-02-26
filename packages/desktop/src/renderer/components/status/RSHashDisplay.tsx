import { useState } from 'react';
import { motion } from 'framer-motion';

interface RSHashDisplayProps {
  hash: string;
}

export function RSHashDisplay({ hash }: RSHashDisplayProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={() => void copy()}
      title="Click to copy full hash"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--mid)',
        border: '1px solid var(--panel-border)',
        borderRadius: 4,
        padding: '10px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.1s',
        marginBottom: 12,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        RS_HASH
      </span>
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--blue)',
          letterSpacing: '0.04em',
          wordBreak: 'break-all',
        }}
      >
        {hash}
      </span>
      <motion.span
        animate={{ opacity: copied ? 1 : 0 }}
        style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}
      >
        Copied
      </motion.span>
    </div>
  );
}
