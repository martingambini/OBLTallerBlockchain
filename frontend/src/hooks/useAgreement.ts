import { useEffect, useRef, useState } from "react";
import {
  getVesting,
  loadAgreementBase,
  loadTokenInfo,
  type Agreement,
  type TokenInfo,
} from "../lib/contracts";
import { useWallet } from "../wallet/WalletContext";

export type AgreementState =
  | { status: "loading" }
  | { status: "notfound" }
  | { status: "error"; message: string }
  | { status: "ready"; agreement: Agreement; token: TokenInfo | null };

function parseId(raw: string | undefined): bigint | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  return BigInt(raw);
}

export function useAgreement(rawId: string | undefined): AgreementState {
  const { provider, chainId, refreshKey } = useWallet();
  const [state, setState] = useState<AgreementState>({ status: "loading" });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const id = parseId(rawId);
    if (id === null) {
      setState({ status: "notfound" });
      return;
    }
    if (!provider) {
      return;
    }
    const vesting = getVesting(chainId, provider);
    if (!vesting) {
      return;
    }

    let cancelled = false;
    const key = `${id}|${chainId}`;

    if (loadedFor.current !== key) {
      setState({ status: "loading" });
    }

    (async () => {
      try {
        const total = BigInt(await vesting.nextAgreementId());
        if (id >= total) {
          if (!cancelled) {
            setState({ status: "notfound" });
          }
          return;
        }

        const agreement = await loadAgreementBase(vesting, id);
        let token: TokenInfo | null = null;
        try {
          token = await loadTokenInfo(agreement.token, provider);
        } catch {
          token = null;
        }

        if (!cancelled) {
          loadedFor.current = key;
          setState({ status: "ready", agreement, token });
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "No se pudo leer el acuerdo desde la cadena.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawId, provider, chainId, refreshKey]);

  return state;
}
