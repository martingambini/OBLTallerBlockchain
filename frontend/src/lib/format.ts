import { formatUnits, parseUnits } from "ethers";

export function shortAddress(address: string | null): string {
  if (!address) {
    return "";
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatAmount(
  value: bigint,
  decimals: number,
  maxFractionDigits = 6,
): string {
  const text = formatUnits(value, decimals);
  const [integer, fraction = ""] = text.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped},${trimmed}` : grouped;
}

export function parseAmount(text: string, decimals: number): bigint | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    return null;
  }
  const fraction = clean.split(".")[1];
  if (fraction && fraction.length > decimals) {
    return null;
  }
  try {
    return parseUnits(clean, decimals);
  } catch {
    return null;
  }
}

export function formatDateTime(timestamp: bigint | number): string {
  return new Date(Number(timestamp) * 1000).toLocaleString("es-UY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDateTimeCompact(timestamp: bigint | number): string {
  return new Date(Number(timestamp) * 1000).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function toTimestamp(dateTimeLocal: string): bigint | null {
  if (!dateTimeLocal) {
    return null;
  }
  const millis = new Date(dateTimeLocal).getTime();
  if (Number.isNaN(millis)) {
    return null;
  }
  return BigInt(Math.floor(millis / 1000));
}

export function toDateTimeLocal(timestamp: bigint | number): string {
  const date = new Date(Number(timestamp) * 1000);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function percent(part: bigint, total: bigint): number {
  if (total === 0n) {
    return 0;
  }
  return Number((part * 10000n) / total) / 100;
}
