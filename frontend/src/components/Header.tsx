import { NavLink } from "react-router-dom";
import { isSupportedChain, networkName } from "../config/networks";
import { shortAddress } from "../lib/format";
import { useWallet } from "../wallet/WalletContext";

const LINKS = [
  { to: "/create", label: "Crear acuerdo" },
  { to: "/created", label: "Acuerdos creados" },
  { to: "/income", label: "Mis ingresos" },
];

export function Header() {
  const { account, chainId, connecting, hasWallet, connect, disconnect } =
    useWallet();
  const supported = isSupportedChain(chainId);

  return (
    <header className="header">
      <div className="brand">Vesting de pagos</div>

      <nav className="nav">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="wallet">
        {account ? (
          <>
            <span className={supported ? "badge ok" : "badge warn"}>
              {networkName(chainId)}
              {chainId !== null && ` · ${chainId}`}
            </span>
            <span className="badge account" title={account}>
              {shortAddress(account)}
            </span>
            <button className="secondary" onClick={disconnect}>
              Desconectar
            </button>
          </>
        ) : (
          <button onClick={connect} disabled={connecting || !hasWallet}>
            {connecting ? "Conectando…" : "Conectar billetera"}
          </button>
        )}
      </div>
    </header>
  );
}
