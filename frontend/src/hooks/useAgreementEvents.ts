import { useEffect, useRef, useState } from "react";
import type { EventLog, Log } from "ethers";
import { getVesting } from "../lib/contracts";
import { useWallet } from "../wallet/WalletContext";

export type HistoryKind = "created" | "claimed" | "cancelled";

export interface HistoryEntry {
  kind: HistoryKind;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: bigint;
  actor: string;
  amount: bigint;
  refunded: bigint;
}

export type EventsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: HistoryEntry[] };

function isEventLog(log: Log | EventLog): log is EventLog {
  return "args" in log;
}

export function useAgreementEvents(id: bigint | null): EventsState {
  const { provider, chainId, refreshKey } = useWallet();
  const [state, setState] = useState<EventsState>({ status: "loading" });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (id === null || !provider) {
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
        const [created, claimed, cancelledLogs] = await Promise.all([
          vesting.queryFilter(vesting.filters.AgreementCreated(id)),
          vesting.queryFilter(vesting.filters.TokensClaimed(id)),
          vesting.queryFilter(vesting.filters.AgreementCancelled(id)),
        ]);

        const raw: Array<{ kind: HistoryKind; log: EventLog }> = [];
        for (const log of created) {
          if (isEventLog(log)) {
            raw.push({ kind: "created", log });
          }
        }
        for (const log of claimed) {
          if (isEventLog(log)) {
            raw.push({ kind: "claimed", log });
          }
        }
        for (const log of cancelledLogs) {
          if (isEventLog(log)) {
            raw.push({ kind: "cancelled", log });
          }
        }

        const blockNumbers = [...new Set(raw.map((item) => item.log.blockNumber))];
        const blocks = await Promise.all(
          blockNumbers.map((number) => provider.getBlock(number)),
        );
        const timestamps = new Map<number, bigint>();
        blocks.forEach((block, index) => {
          timestamps.set(blockNumbers[index], BigInt(block?.timestamp ?? 0));
        });

        const entries: HistoryEntry[] = raw.map(({ kind, log }) => {
          const args = log.args;
          return {
            kind,
            blockNumber: log.blockNumber,
            logIndex: log.index,
            txHash: log.transactionHash,
            timestamp: timestamps.get(log.blockNumber) ?? 0n,
            actor:
              kind === "created"
                ? args.payer
                : kind === "claimed"
                  ? args.beneficiary
                  : args.payer,
            amount:
              kind === "created"
                ? BigInt(args.totalAmount)
                : kind === "claimed"
                  ? BigInt(args.amount)
                  : BigInt(args.vestedAmount),
            refunded: kind === "cancelled" ? BigInt(args.refundedAmount) : 0n,
          };
        });

        entries.sort((a, b) =>
          a.blockNumber !== b.blockNumber
            ? a.blockNumber - b.blockNumber
            : a.logIndex - b.logIndex,
        );

        if (!cancelled) {
          loadedFor.current = key;
          setState({ status: "ready", entries });
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "No se pudo leer el historial de eventos.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, provider, chainId, refreshKey]);

  return state;
}
