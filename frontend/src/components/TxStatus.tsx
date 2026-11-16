import { NETWORKS } from "../config/networks";
import type { TxState } from "../hooks/useTransaction";
import { shortAddress } from "../lib/format";
import { useWallet } from "../wallet/WalletContext";

const TITLES: Record<TxState["status"], string> = {
  idle: "",
  signing: "Esperando confirmación en la billetera…",
  pending: "Transacción pendiente",
  confirmed: "Transacción confirmada",
  failed: "Transacción fallida",
};

export function TxStatus({ state }: { state: TxState }) {
  const { chainId } = useWallet();

  if (state.status === "idle") {
    return null;
  }

  const explorer = chainId !== null ? NETWORKS[chainId]?.explorerUrl : undefined;

  return (
    <div className={`tx ${state.status}`} role="status">
      <strong>{TITLES[state.status]}</strong>
      {state.label && <span> · {state.label}</span>}
      {state.hash && (
        <div className="hash">
          Hash:{" "}
          {explorer ? (
            <a href={`${explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer">
              {shortAddress(state.hash)}
            </a>
          ) : (
            <code title={state.hash}>{shortAddress(state.hash)}</code>
          )}
        </div>
      )}
      {state.error && <div className="error">{state.error}</div>}
    </div>
  );
}
