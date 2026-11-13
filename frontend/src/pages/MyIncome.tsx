import { Link, useNavigate } from "react-router-dom";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { TxStatus } from "../components/TxStatus";
import { useAgreements } from "../hooks/useAgreements";
import { useChainTime } from "../hooks/useChainTime";
import { useTransaction } from "../hooks/useTransaction";
import { getVesting } from "../lib/contracts";
import {
  formatAmount,
  formatDateTime,
  formatDateTimeCompact,
  shortAddress,
} from "../lib/format";
import { tokenMeta } from "../lib/tokens";
import { claimableAt, phaseAt, vestedAt } from "../lib/vesting";
import { useWallet } from "../wallet/WalletContext";
import "./Agreements.css";

export function MyIncome() {
  const { signer, chainId } = useWallet();
  const state = useAgreements("beneficiary");
  const now = useChainTime();
  const tx = useTransaction();
  const navigate = useNavigate();

  async function onClaim(id: bigint) {
    const vesting = getVesting(chainId, signer);
    if (!vesting) {
      return;
    }
    await tx.run(`Reclamar acuerdo #${id}`, () => vesting.claim(id));
  }

  return (
    <section>
      <div className="page-header">
        <h1>Mis ingresos</h1>
        <span className="clock">Hora de la cadena: {formatDateTime(now)}</span>
      </div>

      <TxStatus state={tx.state} />

      {state.status === "loading" && <p>Cargando acuerdos…</p>}
      {state.status === "error" && <p className="error">{state.message}</p>}

      {state.status === "ready" && state.agreements.length === 0 && (
        <div className="empty">
          Todavía no hay acuerdos a tu nombre. Cuando alguien cree uno para tu
          cuenta, va a aparecer acá.
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
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>ID</th>
                <th>Pagador</th>
                <th>Monto total</th>
                <th className="num">Devengado</th>
                <th className="num">Reclamado</th>
                <th className="num">Disponible</th>
                <th>Estado</th>
                <th>Período</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.agreements.map((agreement) => {
                const { symbol, decimals } = tokenMeta(state.tokens, agreement.token);
                const vested = vestedAt(agreement, now);
                const claimable = claimableAt(agreement, now);
                return (
                  <tr
                    key={agreement.id.toString()}
                    className="clickable"
                    onClick={() => navigate(`/agreements/${agreement.id}`)}
                  >
                    <td>
                      <Link to={`/agreements/${agreement.id}`}>#{agreement.id.toString()}</Link>
                    </td>
                    <td className="mono" title={agreement.payer}>
                      {shortAddress(agreement.payer)}
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
                    <td className="num">
                      <strong>
                        {formatAmount(claimable, decimals)} {symbol}
                      </strong>
                    </td>
                    <td>
                      <StatusBadge phase={phaseAt(agreement, now)} />
                    </td>
                    <td className="period">
                      {formatDateTimeCompact(agreement.startTime)}
                      <br />
                      {formatDateTimeCompact(agreement.endTime)}
                    </td>
                    <td>
                      <button
                        className="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          onClaim(agreement.id);
                        }}
                        disabled={tx.busy || claimable === 0n}
                      >
                        Reclamar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
