import type { TokenInfo } from "./contracts";
import { shortAddress } from "./format";

export function tokenMeta(
  tokens: Record<string, TokenInfo>,
  address: string,
): { symbol: string; decimals: number } {
  const info = tokens[address.toLowerCase()];
  if (info) {
    return { symbol: info.symbol, decimals: info.decimals };
  }
  return { symbol: shortAddress(address), decimals: 0 };
}
