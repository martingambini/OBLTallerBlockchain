import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CancelSummary } from "../components/CancelSummary";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { TxStatus } from "../components/TxStatus";
import { NETWORKS } from "../config/networks";
import { useAgreement } from "../hooks/useAgreement";
import {
  useAgreementEvents,
  type HistoryEntry,
} from "../hooks/useAgreementEvents";
import { useChainTime } from "../hooks/useChainTime";
import { useTransaction } from "../hooks/useTransaction";
import { getVesting, type Agreement, type TokenInfo } from "../lib/contracts";
import {
  formatAmount,
  formatDateTime,
  formatDuration,
  percent,
  shortAddress,
} from "../lib/format";
import {
  canCancel,
  claimableAt,
  phaseAt,
  STATUS_CANCELLED,
  vestedAt,
} from "../lib/vesting";
import { useWallet } from "../wallet/WalletContext";
import "./Agreements.css";
import "./AgreementDetail.css";

const EVENT_LABELS = {
  created: "Creado",
  claimed: "Reclamo",
  cancelled: "Cancelado",
} as const;

function sameAddress(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

export function AgreementDetail() {
  const { id } = useParams();
  const { account, signer, chainId } = useWallet();
  const state = useAgreement(id);
  const now = useChainTime();
  const tx = useTransaction();
  const events = useAgreementEvents(id && /^\d+$/.test(id) ? BigInt(id) : null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function onClaim(agreementId: bigint) {
    const vesting = getVesting(chainId, signer);
    if (!vesting) {
      return;
    }
    await tx.run(`Reclamar acuerdo #${agreementId}`, () =>
      vesting.claim(agreementId),
    );
  }

  async function onConfirmCancel(agreementId: bigint) {
    setConfirmCancel(false);
    const vesting = getVesting(chainId, signer);
    if (!vesting) {
      return;
    }
    await tx.run(`Cancelar acuerdo #${agreementId}`, () =>
      vesting.cancel(agreementId),
    );
  }

  if (state.status === "loading") {
    return <p>Cargando acuerdo…</p>;
  }

  if (state.status === "notfound") {
    return (
      <section>
        <h1>Acuerdo no encontrado</h1>
        <p>No existe un acuerdo con el id #{id} en esta red.</p>
        <Link to="/created">Volver a mis acuerdos</Link>
      </section>
    );
  }

  if (state.status === "error") {
    return <p className="error">{state.message}</p>;
  }

  const { agreement, token } = state;
  const decimals = token?.decimals ?? 0;
  const symbol = token?.symbol ?? shortAddress(agreement.token);
  const fmt = (value: bigint) => `${formatAmount(value, decimals)} ${symbol}`;

  const vested = vestedAt(agreement, now);
  const claimable = claimableAt(agreement, now);
  const unvested = agreement.totalAmount - vested;
  const phase = phaseAt(agreement, now);
  const isPayer = sameAddress(account, agreement.payer);
  const isBeneficiary = sameAddress(account, agreement.beneficiary);
  const hasCliff = agreement.cliffTime > agreement.startTime;
  const cancellable = isPayer && canCancel(agreement, now);

  const duration = agreement.endTime - agreement.startTime;
  const elapsed =
    now <= agreement.startTime
      ? 0n
      : now >= agreement.endTime
        ? duration
        : now - agreement.startTime;
  const elapsedPercent = percent(elapsed, duration);
  const cliffPercent = percent(agreement.cliffTime - agreement.startTime, duration);
  const remaining =
    agreement.status === STATUS_CANCELLED || now >= agreement.endTime
      ? null
      : agreement.endTime - now;

  const explorer = chainId !== null ? NETWORKS[chainId]?.explorerUrl : undefined;

  return (
    <section>
      <Link className="back" to={isPayer ? "/created" : "/income"}>
        ← Volver
      </Link>

      <div className="detail-head">
        <h1>Acuerdo #{agreement.id.toString()}</h1>
        <StatusBadge phase={phase} />
        <span className="role">
          {isPayer && isBeneficiary
            ? "Sos pagador y beneficiario"
            : isPayer
              ? "Sos el pagador"
              : isBeneficiary
                ? "Sos el beneficiario"
                : "No participás en este acuerdo"}
        </span>
      </div>
      <span className="clock">Hora de la cadena: {formatDateTime(now)}</span>

      <TxStatus state={tx.state} />

      <div className="card">
        <h2>Información</h2>
        <dl className="facts">
          <div>
            <dt>Pagador</dt>
            <dd className="mono">{agreement.payer}</dd>
          </div>
          <div>
            <dt>Beneficiario</dt>
            <dd className="mono">{agreement.beneficiary}</dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd>
              {token ? `${token.name} (${token.symbol})` : "Token desconocido"}
              <br />
              <span className="mono">{agreement.token}</span>
            </dd>
          </div>
          <div>
            <dt>Revocable</dt>
            <dd>{agreement.revocable ? "Sí" : "No"}</dd>
          </div>
          <div>
            <dt>Monto total</dt>
            <dd>{fmt(agreement.totalAmount)}</dd>
          </div>
          <div>
            <dt>Devengado</dt>
            <dd>{fmt(vested)}</dd>
          </div>
          <div>
            <dt>Ya reclamado</dt>
            <dd>{fmt(agreement.claimedAmount)}</dd>
          </div>
          <div>
            <dt>Disponible para reclamar</dt>
            <dd>
              <strong>{fmt(claimable)}</strong>
            </dd>
          </div>
          <div>
            <dt>
              {agreement.status === STATUS_CANCELLED
                ? "Devuelto al pagador"
                : "Todavía no devengado"}
            </dt>
            <dd>{fmt(unvested)}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{formatDateTime(agreement.startTime)}</dd>
          </div>
          <div>
            <dt>Cliff</dt>
            <dd>{hasCliff ? formatDateTime(agreement.cliffTime) : "Sin cliff"}</dd>
          </div>
          <div>
            <dt>Fin</dt>
            <dd>{formatDateTime(agreement.endTime)}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2>Progreso</h2>
        <div className="bar-block">
          <div className="bar-label">
            <span>Tiempo transcurrido: {elapsedPercent.toFixed(1)} %</span>
            <span>
              {agreement.status === STATUS_CANCELLED
                ? "Acuerdo cancelado"
                : remaining === null
                  ? "El período terminó"
                  : `Faltan ${formatDuration(remaining)}`}
            </span>
          </div>
          <div className="time-bar">
            <div className="time-fill" style={{ width: `${elapsedPercent}%` }} />
            {hasCliff && (
              <div
                className="cliff-mark"
                style={{ left: `${cliffPercent}%` }}
                title="Cliff"
              />
            )}
          </div>
          {hasCliff && <div className="legend">La marca naranja es el cliff.</div>}
        </div>

        <div className="bar-block">
          <div className="bar-label">
            <span>
              Devengado: {percent(vested, agreement.totalAmount).toFixed(1)} %
            </span>
            <span>
              Reclamado: {percent(agreement.claimedAmount, agreement.totalAmount).toFixed(1)} %
            </span>
          </div>
          <ProgressBar
            total={agreement.totalAmount}
            vested={vested}
            claimed={agreement.claimedAmount}
          />
          <div className="legend">
            <span>Barra clara: devengado</span>
            <span>Barra oscura: ya reclamado</span>
          </div>
        </div>
      </div>

      {(isBeneficiary || cancellable) && (
        <div className="card">
          <h2>Acciones</h2>
          <div className="actions-row">
            {isBeneficiary && (
              <button
                onClick={() => onClaim(agreement.id)}
                disabled={tx.busy || claimable === 0n}
              >
                Reclamar {claimable > 0n ? fmt(claimable) : ""}
              </button>
            )}
            {cancellable && (
              <button
                className="danger"
                onClick={() => setConfirmCancel(true)}
                disabled={tx.busy}
              >
                Cancelar acuerdo
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Historial de eventos</h2>
        {events.status === "loading" && <p>Cargando historial…</p>}
        {events.status === "error" && <p className="error">{events.message}</p>}
        {events.status === "ready" && events.entries.length === 0 && (
          <p>No hay eventos registrados para este acuerdo.</p>
        )}
        {events.status === "ready" && events.entries.length > 0 && (
          <table className="history">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Evento</th>
                <th>Detalle</th>
                <th>Transacción</th>
              </tr>
            </thead>
            <tbody>
              {events.entries.map((entry) => (
                <tr key={`${entry.txHash}-${entry.logIndex}`}>
                  <td>{formatDateTime(entry.timestamp)}</td>
                  <td>
                    <span className={`event ${entry.kind}`}>
                      {EVENT_LABELS[entry.kind]}
                    </span>
                  </td>
                  <td>{describeEntry(entry, agreement, token)}</td>
                  <td className="mono">
                    {explorer ? (
                      <a
                        href={`${explorer}/tx/${entry.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(entry.txHash)}
                      </a>
                    ) : (
                      <span title={entry.txHash}>{shortAddress(entry.txHash)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={`¿Cancelar el acuerdo #${agreement.id}?`}
        confirmLabel="Sí, cancelar acuerdo"
        danger
        onConfirm={() => onConfirmCancel(agreement.id)}
        onCancel={() => setConfirmCancel(false)}
      >
        <CancelSummary
          agreement={agreement}
          now={now}
          tokens={token ? { [agreement.token.toLowerCase()]: token } : {}}
        />
      </ConfirmDialog>
    </section>
  );
}

function describeEntry(
  entry: HistoryEntry,
  agreement: Agreement,
  token: TokenInfo | null,
): string {
  const decimals = token?.decimals ?? 0;
  const symbol = token?.symbol ?? shortAddress(agreement.token);
  const fmt = (value: bigint) => `${formatAmount(value, decimals)} ${symbol}`;

  if (entry.kind === "created") {
    return `${shortAddress(entry.actor)} depositó ${fmt(entry.amount)}`;
  }
  if (entry.kind === "claimed") {
    return `${shortAddress(entry.actor)} reclamó ${fmt(entry.amount)}`;
  }
  return `Devengado ${fmt(entry.amount)} para el beneficiario; ${fmt(entry.refunded)} devueltos a ${shortAddress(entry.actor)}`;
}
