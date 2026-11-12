import { vestingInterface, tokenInterface } from "./contracts";

const MESSAGES: Record<string, string> = {
  InvalidBeneficiary: "El beneficiario no puede ser la dirección cero.",
  InvalidToken: "La dirección del token no es válida.",
  InvalidAmount: "El monto debe ser mayor a cero.",
  AmountTooLarge: "El monto es demasiado grande (máximo uint128).",
  InvalidTimeRange: "La fecha de fin debe ser posterior a la de inicio.",
  InvalidCliff: "El cliff debe estar entre la fecha de inicio y la de fin.",
  UnsupportedToken: "Este token cobra comisión al transferir y no está soportado.",
  AgreementNotFound: "El acuerdo no existe.",
  Unauthorized: "Tu cuenta no está autorizada para esta acción.",
  NothingToClaim: "No hay saldo disponible para reclamar todavía.",
  AgreementCompleted: "El acuerdo ya está completado.",
  NotRevocable: "Este acuerdo no es revocable.",
  AgreementNotActive: "El acuerdo ya no está activo.",
  VestingAlreadyEnded: "El período del acuerdo ya terminó; no se puede cancelar.",
  ReentrancyGuardReentrantCall: "Llamada reentrante bloqueada.",
  ERC20InsufficientAllowance:
    "El token no tiene allowance suficiente: aprobá el monto primero.",
  ERC20InsufficientBalance: "No tenés saldo suficiente de este token.",
  SafeERC20FailedOperation: "La transferencia del token falló.",
};

function parseRevertName(data: unknown): string | null {
  if (typeof data !== "string" || data.length < 10) {
    return null;
  }
  for (const iface of [vestingInterface, tokenInterface]) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) {
        return parsed.name;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function describeTxError(error: unknown): string {
  const e = error as {
    code?: string | number;
    revert?: { name?: string } | null;
    data?: unknown;
    info?: { error?: { data?: unknown; message?: string } };
    shortMessage?: string;
    message?: string;
  };

  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
    return "Rechazaste la transacción en la billetera.";
  }

  const name =
    e?.revert?.name ??
    parseRevertName(e?.data) ??
    parseRevertName(e?.info?.error?.data);

  if (name && MESSAGES[name]) {
    return MESSAGES[name];
  }
  if (name) {
    return `El contrato rechazó la operación (${name}).`;
  }

  return (
    e?.shortMessage ??
    e?.message ??
    "La transacción falló por un motivo desconocido."
  );
}
