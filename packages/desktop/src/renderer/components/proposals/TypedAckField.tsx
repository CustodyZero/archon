import { motion } from 'framer-motion';

interface TypedAckFieldProps {
  requiredPhrase: string;
  value: string;
  onChange: (v: string) => void;
  isValid: boolean;
}

export function TypedAckField({ requiredPhrase, value, onChange, isValid }: TypedAckFieldProps) {
  const hasInput = value.length > 0;

  return (
    <div
      style={{
        background: 'rgba(212,136,10,0.06)',
        border: '1px solid rgba(212,136,10,0.25)',
        borderRadius: 4,
        padding: '12px 14px',
        marginBottom: 16,
      }}
    >
      <div style={{ color: 'var(--amber)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Typed Acknowledgment Required
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text)',
          background: 'var(--mid)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '8px 10px',
          marginBottom: 10,
          letterSpacing: '0.03em',
          wordBreak: 'break-all',
        }}
      >
        {requiredPhrase}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type exact phrase above to confirm"
        spellCheck={false}
        autoComplete="off"
        style={{
          width: '100%',
          background: 'var(--dark)',
          border: `1px solid ${hasInput ? (isValid ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
          color: 'var(--text)',
          padding: '7px 10px',
          borderRadius: 3,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          letterSpacing: '0.02em',
          transition: 'border-color 0.15s',
        }}
      />
      <motion.div
        animate={{ opacity: hasInput ? 1 : 0 }}
        style={{
          marginTop: 6,
          fontSize: 11,
          color: isValid ? 'var(--green)' : 'var(--red)',
          height: 16,
        }}
      >
        {isValid ? '✓ Confirmed' : '⊘ Phrase does not match'}
      </motion.div>
    </div>
  );
}
