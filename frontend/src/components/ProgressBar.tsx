import { percent } from "../lib/format";

interface ProgressBarProps {
  total: bigint;
  vested: bigint;
  claimed: bigint;
}

export function ProgressBar({ total, vested, claimed }: ProgressBarProps) {
  const vestedPercent = percent(vested, total);
  const claimedPercent = percent(claimed, total);

  return (
    <div
      className="progress"
      title={`Devengado ${vestedPercent.toFixed(1)}% · Reclamado ${claimedPercent.toFixed(1)}%`}
    >
      <div className="progress-vested" style={{ width: `${vestedPercent}%` }} />
      <div className="progress-claimed" style={{ width: `${claimedPercent}%` }} />
    </div>
  );
}
