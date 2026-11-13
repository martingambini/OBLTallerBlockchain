import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { TxStatus } from "../components/TxStatus";
import { useAgreements } from "../hooks/useAgreements";
import { useChainTime } from "../hooks/useChainTime";
import { useTransaction } from "../hooks/useTransaction";
import { getVesting, type Agreement, type TokenInfo } from "../lib/contracts";
import {
  formatAmount,
  formatDateTime,
  formatDateTimeCompact,
  shortAddress,
} from "../lib/format";
import { tokenMeta } from "../lib/tokens";
import { canCancel, phaseAt, vestedAt } from "../lib/vesting";
import { useWallet } from "../wallet/WalletContext";
import "./Agreements.css";

export function CreatedAgreements() {
  const { signer, chainId } = useWallet();
  const state = useAgreements("payer");
  const now = useChainTime();
  const tx = useTransaction();

  const [pendingId, setPendingId] = useState<bigint | null>(null);

  const pending =
    state.status === "ready" && pendingId !== null
      ? (state.agreements.find((agreement) => agreement.id === pendingId) ?? null)
      : null;

  async function onConfirmCancel() {
    const id = pendingId;
    setPendingId(null);
    const vesting = getVesting(chainId, signer);
    if (id === null || !vesting) {
      return;
    }
    await tx.run(`Cancelar acuerdo #${id}`, () => vesting.cancel(id));
  }

  return (
    <section>
      <div className="page-header">
        <h1>Acuerdos creados</h1>
        <span className="clock">Hora de la cadena: {formatDateTime(now)}</span>
      </div>

      <TxStatus state={tx.state} />

      {state.status === "loading" && <p>Cargando acuerdos…</p>}
      {state.status === "error" && <p className="error">{state.message}</p>}

      {state.status === "ready" && state.agreements.length === 0 && (
        <div className="empty">
          Todavía no creaste ningún acuerdo. <Link to="/create">Crear el primero</Link>
        </div>
      )}

      {state.status === "ready" && state.agreements.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>ID</th>
                <th>Beneficiario</th>
                <th>Monto total</th>
                <th className="num">Devengado</th>
                <th className="num">Reclamado</th>
                <th>Estado</th>
                <th>Período</th>
                <th>Revocable</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.agreements.map((agreement) => {
                const { symbol, decimals } = tokenMeta(state.tokens, agreement.token);
                const vested = vestedAt(agreement, now);
                return (
                  <tr key={agreement.id.toString()}>
                    <td>
                      <Link to={`/agreements/${agreement.id}`}>#{agreement.id.toString()}</Link>
                    </td>
                    <td className="mono" title={agreement.beneficiary}>
                      {shortAddress(agreement.beneficiary)}
                    </td>
                    <td>
                      {formatAmount(agreement.totalAmount, decimals)} {symbol}
                    </td>
                    <td className="num">
                      {formatAmount(vested, decimals)} {symbol}
                      <ProgressBar
                        total={agreement.totalAmount}
                        vested={vested}
                        claimed={agreement.claimedAmount}
                      />
                    </td>
                    <td className="num">
                      {formatAmount(agreement.claimedAmount, decimals)} {symbol}
                    </td>
                    <td>
                      <StatusBadge phase={phaseAt(agreement, now)} />
                    </td>
                    <td className="period">
                      {formatDateTimeCompact(agreement.startTime)}
                      <br />
                      {formatDateTimeCompact(agreement.endTime)}
                    </td>
                    <td>{agreement.revocable ? "Sí" : "No"}</td>
                    <td>
                      {canCancel(agreement, now) && (
                        <button
                          className="danger small"
                          onClick={() => setPendingId(agreement.id)}
                          disabled={tx.busy}
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `¿Cancelar el acuerdo #${pending.id}?` : ""}
        confirmLabel="Sí, cancelar acuerdo"
        danger
        onConfirm={onConfirmCancel}
        onCancel={() => setPendingId(null)}
      >
        {pending && state.status === "ready" && (
          <CancelSummary
            agreement={pending}
            now={now}
            tokens={state.tokens}
          />
        )}
      </ConfirmDialog>
    </section>
  );
}

function CancelSummary({
  agreement,
  now,
  tokens,
}: {
  agreement: Agreement;
  now: bigint;
  tokens: Record<string, TokenInfo>;
}) {
  const { symbol, decimals } = tokenMeta(tokens, agreement.token);
  const vested = vestedAt(agreement, now);
  const refund = agreement.totalAmount - vested;

  return (
    <>
      <span>
        Para el beneficiario ({shortAddress(agreement.beneficiary)}) queda lo ya
        devengado:{" "}
        <strong>
          ≈ {formatAmount(vested, decimals)} {symbol}
        </strong>
        .
      </span>
      <span>
        A tu cuenta vuelve lo no devengado:{" "}
        <strong>
          ≈ {formatAmount(refund, decimals)} {symbol}
        </strong>
        .
      </span>
      <span>
        Los montos son una estimación: el contrato calcula con la hora del
        bloque en que se confirme. Esta acción no se puede deshacer.
      </span>
    </>
  );
}
