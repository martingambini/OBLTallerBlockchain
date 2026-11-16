import deployments from "../contracts/deployments.json";

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl?: string;
  explorerUrl?: string;
  nativeSymbol: string;
}

export const NETWORKS: Record<number, NetworkConfig> = {
  31337: {
    chainId: 31337,
    name: "Hardhat local",
    rpcUrl: "http://127.0.0.1:8545",
    nativeSymbol: "ETH",
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeSymbol: "SepoliaETH",
  },
};

export interface ContractAddresses {
  Vesting: string;
  MockToken: string;
}

const registry = deployments as Record<string, ContractAddresses>;

export function getAddresses(chainId: number | null): ContractAddresses | null {
  if (chainId === null) {
    return null;
  }
  return registry[String(chainId)] ?? null;
}

export function isSupportedChain(chainId: number | null): boolean {
  return getAddresses(chainId) !== null;
}

export function supportedChains(): NetworkConfig[] {
  return Object.keys(registry)
    .map((id) => NETWORKS[Number(id)])
    .filter((network): network is NetworkConfig => Boolean(network));
}

export function networkName(chainId: number | null): string {
  if (chainId === null) {
    return "Sin red";
  }
  return NETWORKS[chainId]?.name ?? `Red desconocida (${chainId})`;
}
