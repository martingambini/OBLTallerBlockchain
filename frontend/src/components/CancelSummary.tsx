import type { Agreement, TokenInfo } from "../lib/contracts";
import { formatAmount, shortAddress } from "../lib/format";
import { tokenMeta } from "../lib/tokens";
import { vestedAt } from "../lib/vesting";

interface CancelSummaryProps {
  agreement: Agreement;
  now: bigint;
  tokens: Record<string, TokenInfo>;
}

export function CancelSummary({ agreement, now, tokens }: CancelSummaryProps) {
  const { symbol, decimals } = tokenMeta(tokens, agreement.token);
  const vested = vestedAt(agreement, now);
  const refund = agreement.totalAmount - vested;

  return (
    <>
      <span>
        Para el beneficiario ({shortAddress(agreement.beneficiary)}) queda lo ya
        devengado:{" "}
        <strong>
          ≈ {formatAmount(vested, decimals)} {symbol}
        </strong>
        .
      </span>
      <span>
        A tu cuenta vuelve lo no devengado:{" "}
        <strong>
          ≈ {formatAmount(refund, decimals)} {symbol}
        </strong>
        .
      </span>
      <span>
        Los montos son una estimación: el contrato calcula con la hora del
        bloque en que se confirme. Esta acción no se puede deshacer.
      </span>
    </>
  );
}
