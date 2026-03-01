import chalk, { type ChalkInstance } from 'chalk'

export const t = {
  blue:       chalk.hex('#4FC3F7'),
  blueBright: chalk.hex('#81D4FA'),
  blueDim:    chalk.hex('#0277BD'),
  text:       chalk.hex('#C8C8C0'),
  white:      chalk.hex('#F2F2EC'),
  dim:        chalk.hex('#444444'),
  muted:      chalk.hex('#666666'),
  amber:      chalk.hex('#D4880A'),
  green:      chalk.hex('#81C784'),
  red:        chalk.hex('#CF6679'),
} as const

const _tierColors: Record<string, ChalkInstance> = {
  T0: t.muted,
  T1: t.text,
  T2: t.amber,
  T3: t.red,
}

export const tierColor = (tier: string): ChalkInstance =>
  _tierColors[tier] ?? t.muted

const _outcomeColors: Record<string, ChalkInstance> = {
  Permit:   t.green,
  Deny:     t.red,
  Escalate: t.amber,
}

export const outcomeColor = (outcome: string): ChalkInstance =>
  _outcomeColors[outcome] ?? t.muted
