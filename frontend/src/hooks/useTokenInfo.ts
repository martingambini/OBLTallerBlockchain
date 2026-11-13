import { useEffect, useRef, useState } from "react";
import { isAddress } from "ethers";
import { getAddresses } from "../config/networks";
import { getErc20, loadTokenInfo, type TokenInfo } from "../lib/contracts";
import { useWallet } from "../wallet/WalletContext";

export type TokenState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      info: TokenInfo;
      balance: bigint;
      allowance: bigint;
    };

export function useTokenInfo(address: string): TokenState {
  const { provider, account, chainId, refreshKey } = useWallet();
  const [state, setState] = useState<TokenState>({ status: "idle" });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = address.trim();

    if (!trimmed) {
      loadedFor.current = null;
      setState({ status: "idle" });
      return;
    }
    if (!isAddress(trimmed)) {
      loadedFor.current = null;
      setState({ status: "invalid" });
      return;
    }
    const addresses = getAddresses(chainId);
    if (!provider || !account || !addresses) {
      return;
    }

    let cancelled = false;
    const key = `${trimmed.toLowerCase()}|${account}|${chainId}`;

    if (loadedFor.current !== key) {
      setState({ status: "loading" });
    }

    (async () => {
      try {
        const info = await loadTokenInfo(trimmed, provider);
        const token = getErc20(trimmed, provider);
        const [balance, allowance] = await Promise.all([
          token.balanceOf(account),
          token.allowance(account, addresses.Vesting),
        ]);
        if (!cancelled) {
          loadedFor.current = key;
          setState({
            status: "ready",
            info,
            balance: BigInt(balance),
            allowance: BigInt(allowance),
          });
        }
      } catch {
        if (!cancelled) {
          loadedFor.current = null;
          setState({
            status: "error",
            message:
              "No se pudo leer el token. Verificá que la dirección sea un contrato ERC-20 en esta red.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, provider, account, chainId, refreshKey]);

  return state;
}
