import { useEffect, useRef, useState } from "react";
import { useWallet } from "../wallet/WalletContext";

function localSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

async function readChainSeconds(
  provider: NonNullable<ReturnType<typeof useWallet>["provider"]>,
): Promise<bigint> {
  const latest = await provider.getBlock("latest");
  let seconds = BigInt(latest?.timestamp ?? 0);

  try {
    const pending = (await provider.send("eth_getBlockByNumber", [
      "pending",
      false,
    ])) as { timestamp?: string } | null;
    if (pending?.timestamp) {
      const pendingSeconds = BigInt(pending.timestamp);
      if (pendingSeconds > seconds) {
        seconds = pendingSeconds;
      }
    }
  } catch {
    return seconds;
  }

  return seconds;
}

export function useChainTime(): bigint {
  const { provider, refreshKey } = useWallet();
  const [now, setNow] = useState<bigint>(localSeconds);
  const anchor = useRef<{ chain: bigint; local: number } | null>(null);

  useEffect(() => {
    if (!provider) {
      return;
    }
    let cancelled = false;

    readChainSeconds(provider)
      .then((chain) => {
        if (cancelled) {
          return;
        }
        anchor.current = { chain, local: Date.now() };
        setNow(chain);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [provider, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = anchor.current;
      if (current) {
        const elapsed = BigInt(Math.floor((Date.now() - current.local) / 1000));
        setNow(current.chain + elapsed);
      } else {
        setNow(localSeconds());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}
