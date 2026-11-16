import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { NETWORKS } from "../config/networks";

const DISCONNECTED_KEY = "wallet-disconnected";

interface WalletState {
  hasWallet: boolean;
  account: string | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  connecting: boolean;
  error: string | null;
  refreshKey: number;
  refresh: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

function readFlag(): boolean {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlag(value: boolean) {
  try {
    if (value) {
      localStorage.setItem(DISCONNECTED_KEY, "1");
    } else {
      localStorage.removeItem(DISCONNECTED_KEY);
    }
  } catch {
    return;
  }
}

function describeError(error: unknown): string {
  const e = error as { code?: number | string; shortMessage?: string; message?: string };
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
    return "Rechazaste la solicitud en la billetera.";
  }
  return e?.shortMessage ?? e?.message ?? "Error desconocido de la billetera.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const ethereum = typeof window === "undefined" ? undefined : window.ethereum;
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const providerRef = useRef<BrowserProvider | null>(null);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const clear = useCallback(() => {
    providerRef.current?.removeAllListeners();
    providerRef.current = null;
    setProvider(null);
    setSigner(null);
    setAccount(null);
  }, []);

  const attach = useCallback(
    async (address: string) => {
      if (!ethereum) {
        return;
      }
      providerRef.current?.removeAllListeners();
      const nextProvider = new BrowserProvider(ethereum, "any");
      const network = await nextProvider.getNetwork();
      const nextSigner = await nextProvider.getSigner(address);

      nextProvider.on("block", () => setRefreshKey((key) => key + 1));

      providerRef.current = nextProvider;
      setProvider(nextProvider);
      setSigner(nextSigner);
      setAccount(address);
      setChainId(Number(network.chainId));
    },
    [ethereum],
  );

  const connect = useCallback(async () => {
    if (!ethereum) {
      setError("No se detectó ninguna billetera (instalá MetaMask).");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      writeFlag(false);
      if (accounts.length > 0) {
        await attach(accounts[0]);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setConnecting(false);
    }
  }, [ethereum, attach]);

  const disconnect = useCallback(() => {
    writeFlag(true);
    clear();
  }, [clear]);

  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      if (!ethereum) {
        return;
      }
      setError(null);
      const hexChainId = "0x" + targetChainId.toString(16);
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        });
      } catch (e) {
        const code = (e as { code?: number }).code;
        const config = NETWORKS[targetChainId];
        if ((code === 4902 || code === -32603) && config?.rpcUrl) {
          try {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: hexChainId,
                  chainName: config.name,
                  rpcUrls: [config.rpcUrl],
                  nativeCurrency: {
                    name: config.nativeSymbol,
                    symbol: config.nativeSymbol,
                    decimals: 18,
                  },
                },
              ],
            });
            return;
          } catch (addError) {
            setError(describeError(addError));
            return;
          }
        }
        setError(describeError(e));
      }
    },
    [ethereum],
  );

  useEffect(() => {
    if (!ethereum) {
      return;
    }

    if (!readFlag()) {
      ethereum
        .request({ method: "eth_accounts" })
        .then(async (accounts) => {
          const list = accounts as string[];
          if (list.length > 0) {
            await attach(list[0]);
          }
        })
        .catch(() => undefined);
    }

    const onAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        clear();
        return;
      }
      if (!readFlag()) {
        await attach(accounts[0]);
      }
    };

    const onChainChanged = (hexChainId: string) => {
      setChainId(parseInt(hexChainId, 16));
      setRefreshKey((key) => key + 1);
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    ethereum.on("chainChanged", onChainChanged);

    return () => {
      ethereum.removeListener("accountsChanged", onAccountsChanged);
      ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [ethereum, attach, clear]);

  const value = useMemo<WalletState>(
    () => ({
      hasWallet: Boolean(ethereum),
      account,
      chainId,
      provider,
      signer,
      connecting,
      error,
      refreshKey,
      refresh,
      connect,
      disconnect,
      switchNetwork,
    }),
    [
      ethereum,
      account,
      chainId,
      provider,
      signer,
      connecting,
      error,
      refreshKey,
      refresh,
      connect,
      disconnect,
      switchNetwork,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet debe usarse dentro de WalletProvider");
  }
  return context;
}
