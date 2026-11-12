import { Contract, Interface, type ContractRunner } from "ethers";
import VestingAbi from "../contracts/abi/Vesting.json";
import MockTokenAbi from "../contracts/abi/MockToken.json";
import { getAddresses } from "../config/networks";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export const vestingInterface = new Interface(VestingAbi);
export const tokenInterface = new Interface(MockTokenAbi);

export function getVesting(
  chainId: number | null,
  runner: ContractRunner | null,
): Contract | null {
  const addresses = getAddresses(chainId);
  if (!addresses || !runner) {
    return null;
  }
  return new Contract(addresses.Vesting, vestingInterface, runner);
}

export function getMockToken(
  chainId: number | null,
  runner: ContractRunner | null,
): Contract | null {
  const addresses = getAddresses(chainId);
  if (!addresses || !runner) {
    return null;
  }
  return new Contract(addresses.MockToken, tokenInterface, runner);
}

export function getErc20(address: string, runner: ContractRunner): Contract {
  return new Contract(address, ERC20_ABI, runner);
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export async function loadTokenInfo(
  address: string,
  runner: ContractRunner,
): Promise<TokenInfo> {
  const token = getErc20(address, runner);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);
  return { address, name, symbol, decimals: Number(decimals) };
}

export const STATUS_LABELS = ["Activo", "Completado", "Cancelado"] as const;

export interface AgreementView {
  id: bigint;
  payer: string;
  beneficiary: string;
  token: string;
  startTime: bigint;
  cliffTime: bigint;
  endTime: bigint;
  revocable: boolean;
  status: number;
  totalAmount: bigint;
  claimedAmount: bigint;
  vestedAtCancel: bigint;
  vested: bigint;
  claimable: bigint;
}

export async function loadAgreement(
  vesting: Contract,
  id: bigint,
): Promise<AgreementView> {
  const [raw, vested, claimable] = await Promise.all([
    vesting.getAgreement(id),
    vesting.vestedAmount(id),
    vesting.claimableAmount(id),
  ]);

  return {
    id,
    payer: raw.payer,
    beneficiary: raw.beneficiary,
    token: raw.token,
    startTime: BigInt(raw.startTime),
    cliffTime: BigInt(raw.cliffTime),
    endTime: BigInt(raw.endTime),
    revocable: raw.revocable,
    status: Number(raw.status),
    totalAmount: BigInt(raw.totalAmount),
    claimedAmount: BigInt(raw.claimedAmount),
    vestedAtCancel: BigInt(raw.vestedAtCancel),
    vested: BigInt(vested),
    claimable: BigInt(claimable),
  };
}
