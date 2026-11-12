import { useCallback, useState } from "react";
import type { ContractTransactionResponse, TransactionReceipt } from "ethers";
import { describeTxError } from "../lib/errors";
import { useWallet } from "../wallet/WalletContext";

export type TxStatus = "idle" | "signing" | "pending" | "confirmed" | "failed";

export interface TxState {
  status: TxStatus;
  label: string | null;
  hash: string | null;
  error: string | null;
}

const INITIAL: TxState = { status: "idle", label: null, hash: null, error: null };

export function useTransaction() {
  const { refresh } = useWallet();
  const [state, setState] = useState<TxState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  const run = useCallback(
    async (
      label: string,
      send: () => Promise<ContractTransactionResponse>,
    ): Promise<TransactionReceipt | null> => {
      setState({ status: "signing", label, hash: null, error: null });
      try {
        const tx = await send();
        setState({ status: "pending", label, hash: tx.hash, error: null });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
          setState({
            status: "failed",
            label,
            hash: tx.hash,
            error: "La transacción fue revertida.",
          });
          return null;
        }
        setState({ status: "confirmed", label, hash: tx.hash, error: null });
        refresh();
        return receipt;
      } catch (error) {
        setState((current) => ({
          status: "failed",
          label,
          hash: current.hash,
          error: describeTxError(error),
        }));
        return null;
      }
    },
    [refresh],
  );

  return {
    state,
    run,
    reset,
    busy: state.status === "signing" || state.status === "pending",
  };
}
