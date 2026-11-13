import { useEffect, useRef, useState } from "react";
import {
  getVesting,
  loadAgreementBase,
  loadAgreementIds,
  loadTokenInfo,
  type Agreement,
  type TokenInfo,
} from "../lib/contracts";
import { useWallet } from "../wallet/WalletContext";

export type Role = "payer" | "beneficiary";

export type AgreementsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      agreements: Agreement[];
      tokens: Record<string, TokenInfo>;
    };

export function useAgreements(role: Role): AgreementsState {
  const { provider, account, chainId, refreshKey } = useWallet();
  const [state, setState] = useState<AgreementsState>({ status: "loading" });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!provider || !account) {
      return;
    }
    const vesting = getVesting(chainId, provider);
    if (!vesting) {
      return;
    }

    let cancelled = false;
    const key = `${role}|${account}|${chainId}`;

    if (loadedFor.current !== key) {
      setState({ status: "loading" });
    }

    (async () => {
      try {
        const ids = await loadAgreementIds(vesting, role, account);
        const agreements = await Promise.all(
          ids.map((id) => loadAgreementBase(vesting, id)),
        );
        agreements.sort((a, b) => (a.id < b.id ? 1 : -1));

        const tokenAddresses = [
          ...new Set(agreements.map((agreement) => agreement.token.toLowerCase())),
        ];
        const infos = await Promise.allSettled(
          tokenAddresses.map((address) => loadTokenInfo(address, provider)),
        );
        const tokens: Record<string, TokenInfo> = {};
        infos.forEach((result, index) => {
          if (result.status === "fulfilled") {
            tokens[tokenAddresses[index]] = result.value;
          }
        });

        if (!cancelled) {
          loadedFor.current = key;
          setState({ status: "ready", agreements, tokens });
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "No se pudieron leer los acuerdos desde la cadena.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, account, chainId, role, refreshKey]);

  return state;
}
