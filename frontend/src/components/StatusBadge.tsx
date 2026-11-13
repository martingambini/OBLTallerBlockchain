import { PHASE_LABELS, type Phase } from "../lib/vesting";

export function StatusBadge({ phase }: { phase: Phase }) {
  return <span className={`status ${phase}`}>{PHASE_LABELS[phase]}</span>;
}
