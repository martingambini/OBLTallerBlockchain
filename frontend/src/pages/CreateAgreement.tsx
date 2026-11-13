import { useMemo, useState, type FormEvent } from "react";
import { isAddress, ZeroAddress } from "ethers";
import { getAddresses } from "../config/networks";
import { useTokenInfo } from "../hooks/useTokenInfo";
import {
  formatAmount,
  formatDateTime,
  parseAmount,
  toDateTimeLocal,
  toTimestamp,
} from "../lib/format";
import { useWallet } from "../wallet/WalletContext";
import "./CreateAgreement.css";

const UINT128_MAX = 2n ** 128n - 1n;
const UINT48_MAX = 2n ** 48n - 1n;
const UNLIMITED_ALLOWANCE = 2n ** 200n;
const DAY_SECONDS = 24 * 60 * 60;

function defaultStart(): string {
  const now = Math.floor(Date.now() / 1000);
  return toDateTimeLocal(now - (now % 60));
}

function defaultEnd(): string {
  const now = Math.floor(Date.now() / 1000);
  return toDateTimeLocal(now - (now % 60) + 30 * DAY_SECONDS);
}

export function CreateAgreement() {
  const { chainId } = useWallet();
  const addresses = getAddresses(chainId);

  const [beneficiary, setBeneficiary] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [cliff, setCliff] = useState("");
  const [end, setEnd] = useState(defaultEnd);
  const [revocable, setRevocable] = useState(true);

  const tokenState = useTokenInfo(token);

  const busy = false;
  const decimals = tokenState.status === "ready" ? tokenState.info.decimals : null;
  const symbol = tokenState.status === "ready" ? tokenState.info.symbol : "";

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    const beneficiaryText = beneficiary.trim();
    if (beneficiaryText) {
      if (!isAddress(beneficiaryText)) {
        errors.beneficiary = "No es una dirección válida.";
      } else if (beneficiaryText.toLowerCase() === ZeroAddress) {
        errors.beneficiary = "El beneficiario no puede ser la dirección cero.";
      }
    }

    if (token.trim() && tokenState.status === "invalid") {
      errors.token = "No es una dirección válida.";
    }
    if (tokenState.status === "error") {
      errors.token = tokenState.message;
    }

    let totalAmount: bigint | null = null;
    if (amount.trim()) {
      if (decimals === null) {
        errors.amount = "Ingresá primero un token válido para validar el monto.";
      } else {
        totalAmount = parseAmount(amount, decimals);
        if (totalAmount === null) {
          errors.amount = `Monto inválido (máximo ${decimals} decimales).`;
        } else if (totalAmount === 0n) {
          errors.amount = "El monto debe ser mayor a cero.";
        } else if (totalAmount > UINT128_MAX) {
          errors.amount = "El monto es demasiado grande.";
        } else if (tokenState.status === "ready" && totalAmount > tokenState.balance) {
          errors.amount = `Saldo insuficiente: tenés ${formatAmount(
            tokenState.balance,
            tokenState.info.decimals,
          )} ${tokenState.info.symbol}.`;
        }
      }
    }

    const startTs = toTimestamp(start);
    const endTs = toTimestamp(end);
    const cliffTs = cliff ? toTimestamp(cliff) : startTs;

    if (start && startTs === null) {
      errors.start = "Fecha inválida.";
    }
    if (end && endTs === null) {
      errors.end = "Fecha inválida.";
    }
    if (startTs !== null && endTs !== null) {
      if (endTs <= startTs) {
        errors.end = "La fecha de fin debe ser posterior a la de inicio.";
      } else if (endTs > UINT48_MAX) {
        errors.end = "La fecha de fin es demasiado lejana.";
      }
      if (cliff && cliffTs !== null && (cliffTs < startTs || cliffTs > endTs)) {
        errors.cliff = "El cliff debe estar entre el inicio y el fin.";
      }
    }

    const complete =
      isAddress(beneficiary.trim()) &&
      tokenState.status === "ready" &&
      totalAmount !== null &&
      startTs !== null &&
      endTs !== null &&
      cliffTs !== null;

    return {
      errors,
      valid: complete && Object.keys(errors).length === 0,
      totalAmount,
      startTs,
      endTs,
      cliffTs,
    };
  }, [beneficiary, token, amount, start, cliff, end, tokenState, decimals]);

  const needsApproval =
    tokenState.status === "ready" &&
    validation.totalAmount !== null &&
    tokenState.allowance < validation.totalAmount;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  function onReset() {
    setBeneficiary("");
    setAmount("");
    setStart(defaultStart());
    setCliff("");
    setEnd(defaultEnd());
    setRevocable(true);
  }

  const errors = validation.errors;
  const durationDays =
    validation.startTs !== null &&
    validation.endTs !== null &&
    validation.endTs > validation.startTs
      ? Number(validation.endTs - validation.startTs) / DAY_SECONDS
      : null;

  return (
    <section>
      <h1>Crear acuerdo</h1>
      <p className="hint">
        El monto total se deposita en el contrato al crear el acuerdo y se va
        liberando de forma lineal hasta la fecha de fin.
      </p>

      <form className="form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="beneficiary">Beneficiario</label>
          <input
            id="beneficiary"
            type="text"
            placeholder="0x…"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            className={errors.beneficiary ? "invalid" : undefined}
            disabled={busy}
            autoComplete="off"
          />
          {errors.beneficiary && <span className="error">{errors.beneficiary}</span>}
        </div>

        <div className="field">
          <label htmlFor="token">Token (dirección ERC-20)</label>
          <input
            id="token"
            type="text"
            placeholder="0x…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={errors.token ? "invalid" : undefined}
            disabled={busy}
            autoComplete="off"
          />
          <div className="inline">
            {addresses && (
              <button
                type="button"
                className="secondary"
                onClick={() => setToken(addresses.MockToken)}
                disabled={busy}
              >
                Usar token de prueba
              </button>
            )}
          </div>
          {errors.token && <span className="error">{errors.token}</span>}
          {tokenState.status === "loading" && (
            <span className="hint">Leyendo token…</span>
          )}
          {tokenState.status === "ready" && (
            <span className="hint">
              {tokenState.info.name} ({tokenState.info.symbol}) · {tokenState.info.decimals}{" "}
              decimales · Tu saldo:{" "}
              {formatAmount(tokenState.balance, tokenState.info.decimals)}{" "}
              {tokenState.info.symbol} · Allowance actual:{" "}
              {tokenState.allowance >= UNLIMITED_ALLOWANCE
                ? "ilimitado"
                : `${formatAmount(tokenState.allowance, tokenState.info.decimals)} ${tokenState.info.symbol}`}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="amount">
            Monto total{symbol ? ` (${symbol})` : ""}
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={errors.amount ? "invalid" : undefined}
            disabled={busy}
            autoComplete="off"
          />
          {errors.amount && <span className="error">{errors.amount}</span>}
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="start">Inicio</label>
            <input
              id="start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={errors.start ? "invalid" : undefined}
              disabled={busy}
            />
            {errors.start && <span className="error">{errors.start}</span>}
          </div>
          <div className="field">
            <label htmlFor="end">Fin</label>
            <input
              id="end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={errors.end ? "invalid" : undefined}
              disabled={busy}
            />
            {errors.end && <span className="error">{errors.end}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cliff">Cliff (opcional)</label>
          <input
            id="cliff"
            type="datetime-local"
            value={cliff}
            onChange={(e) => setCliff(e.target.value)}
            className={errors.cliff ? "invalid" : undefined}
            disabled={busy}
          />
          <span className="hint">
            Antes del cliff no se puede reclamar nada. Si lo dejás vacío, no hay
            cliff. Si el inicio ya pasó, lo devengado hasta ahora queda
            disponible enseguida.
          </span>
          {errors.cliff && <span className="error">{errors.cliff}</span>}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={revocable}
            onChange={(e) => setRevocable(e.target.checked)}
            disabled={busy}
          />
          Revocable (el pagador puede cancelarlo; lo devengado queda para el
          beneficiario y el resto vuelve al pagador)
        </label>

        {validation.valid &&
          tokenState.status === "ready" &&
          validation.totalAmount !== null &&
          validation.startTs !== null &&
          validation.endTs !== null && (
            <div className="summary">
              <dl>
                <dt>Se depositan</dt>
                <dd>
                  {formatAmount(validation.totalAmount, tokenState.info.decimals)}{" "}
                  {tokenState.info.symbol}
                </dd>
                <dt>Período</dt>
                <dd>
                  {formatDateTime(validation.startTs)} →{" "}
                  {formatDateTime(validation.endTs)}
                  {durationDays !== null && ` (${durationDays.toLocaleString("es-UY", { maximumFractionDigits: 2 })} días)`}
                </dd>
                <dt>Pasos</dt>
                <dd>
                  {needsApproval
                    ? "1) Aprobar el monto  2) Crear el acuerdo"
                    : "Crear el acuerdo (el allowance alcanza)"}
                </dd>
              </dl>
            </div>
          )}

        <div className="inline">
          <button type="submit" disabled={busy || !validation.valid}>
            {busy
              ? "Procesando…"
              : needsApproval
                ? "Aprobar y crear acuerdo"
                : "Crear acuerdo"}
          </button>
          <button type="button" className="secondary" onClick={onReset} disabled={busy}>
            Limpiar
          </button>
        </div>
      </form>

    </section>
  );
}
