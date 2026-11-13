import type { Agreement } from "./contracts";

export const STATUS_ACTIVE = 0;
export const STATUS_COMPLETED = 1;
export const STATUS_CANCELLED = 2;

export function vestedAt(agreement: Agreement, now: bigint): bigint {
  if (agreement.status === STATUS_CANCELLED) {
    return agreement.vestedAtCancel;
  }
  if (now < agreement.cliffTime) {
    return 0n;
  }
  if (now >= agreement.endTime) {
    return agreement.totalAmount;
  }
  const elapsed = now - agreement.startTime;
  const duration = agreement.endTime - agreement.startTime;
  return (agreement.totalAmount * elapsed) / duration;
}

export function claimableAt(agreement: Agreement, now: bigint): bigint {
  const vested = vestedAt(agreement, now);
  return vested > agreement.claimedAmount ? vested - agreement.claimedAmount : 0n;
}

export type Phase =
  | "upcoming"
  | "cliff"
  | "running"
  | "ended"
  | "completed"
  | "cancelled";

export function phaseAt(agreement: Agreement, now: bigint): Phase {
  if (agreement.status === STATUS_CANCELLED) {
    return "cancelled";
  }
  if (agreement.status === STATUS_COMPLETED) {
    return "completed";
  }
  if (now < agreement.startTime) {
    return "upcoming";
  }
  if (now < agreement.cliffTime) {
    return "cliff";
  }
  if (now >= agreement.endTime) {
    return "ended";
  }
  return "running";
}

export const PHASE_LABELS: Record<Phase, string> = {
  upcoming: "Por iniciar",
  cliff: "En período de cliff",
  running: "En curso",
  ended: "Finalizado (falta reclamar)",
  completed: "Completado",
  cancelled: "Cancelado",
};

export function canCancel(agreement: Agreement, now: bigint): boolean {
  return (
    agreement.revocable &&
    agreement.status === STATUS_ACTIVE &&
    now < agreement.endTime
  );
}
