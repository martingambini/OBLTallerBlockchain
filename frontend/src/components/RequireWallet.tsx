import type { ReactNode } from "react";
import {
  isSupportedChain,
  networkName,
  supportedChains,
} from "../config/networks";
import { useWallet } from "../wallet/WalletContext";

export function RequireWallet({ children }: { children: ReactNode }) {
  const { account, chainId, hasWallet, connecting, error, connect, switchNetwork } =
    useWallet();

  if (!hasWallet) {
    return (
      <div className="notice warn">
        No se detectó ninguna billetera. Instalá MetaMask y recargá la página.
      </div>
    );
  }

  if (!account) {
    return (
      <div className="notice">
        <p>Conectá tu billetera para usar la aplicación.</p>
        <button onClick={connect} disabled={connecting}>
          {connecting ? "Conectando…" : "Conectar billetera"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (!isSupportedChain(chainId)) {
    return (
      <div className="notice warn">
        <p>
          Estás en la red <strong>{networkName(chainId)}</strong>, pero los
          contratos no están desplegados ahí. Cambiá a una de estas redes:
        </p>
        <div className="actions">
          {supportedChains().map((network) => (
            <button
              key={network.chainId}
              onClick={() => switchNetwork(network.chainId)}
            >
              Cambiar a {network.name}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
