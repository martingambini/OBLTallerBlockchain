import { readFile } from "node:fs/promises";
import path from "node:path";
import { network } from "hardhat";

const { ethers } = await network.connect();

const DAY = 24n * 60n * 60n;
const DECIMALS = 6;
const units = (value: string) => ethers.parseUnits(value, DECIMALS);

const chainId = Number((await ethers.provider.getNetwork()).chainId);
const deployments = JSON.parse(
  await readFile(
    path.join("frontend", "src", "contracts", "deployments.json"),
    "utf-8",
  ),
);
const addresses = deployments[chainId];
if (!addresses) {
  throw new Error(
    `No hay direcciones exportadas para chainId ${chainId}. Corré primero el deploy.`,
  );
}

const [payer, beneficiaryA, beneficiaryB] = await ethers.getSigners();
const token = await ethers.getContractAt("MockToken", addresses.MockToken);
const vesting = await ethers.getContractAt("Vesting", addresses.Vesting);
const tokenAddress = await token.getAddress();
const vestingAddress = await vesting.getAddress();

const latest = await ethers.provider.getBlock("latest");
const now = BigInt(latest!.timestamp);

await (await token.mint(payer.address, units("1000000"))).wait();
await (await token.approve(vestingAddress, ethers.MaxUint256)).wait();

async function createAgreement(
  label: string,
  beneficiary: string,
  amount: string,
  start: bigint,
  cliff: bigint,
  end: bigint,
  revocable: boolean,
) {
  const tx = await vesting.createAgreement(
    beneficiary,
    tokenAddress,
    units(amount),
    start,
    cliff,
    end,
    revocable,
  );
  await tx.wait();
  const id = (await vesting.nextAgreementId()) - 1n;
  console.log(`#${id} ${label}`);
  return id;
}

await createAgreement(
  "en curso, revocable, sin cliff",
  beneficiaryA.address,
  "12000",
  now - 10n * DAY,
  now - 10n * DAY,
  now + 20n * DAY,
  true,
);

await createAgreement(
  "en curso, NO revocable, sin cliff",
  beneficiaryA.address,
  "6000",
  now - 5n * DAY,
  now - 5n * DAY,
  now + 25n * DAY,
  false,
);

await createAgreement(
  "futuro, revocable, con cliff de 10 días",
  beneficiaryB.address,
  "3000",
  now + 5n * DAY,
  now + 15n * DAY,
  now + 65n * DAY,
  true,
);

const cancelledId = await createAgreement(
  "cancelado a mitad de camino",
  beneficiaryB.address,
  "9000",
  now - 15n * DAY,
  now - 15n * DAY,
  now + 15n * DAY,
  true,
);
await (await vesting.cancel(cancelledId)).wait();

const completedId = await createAgreement(
  "completado (todo reclamado)",
  beneficiaryA.address,
  "1500",
  now - 3n * DAY,
  now - 3n * DAY,
  now - 1n * DAY,
  false,
);
await (await vesting.connect(beneficiaryA).claim(completedId)).wait();

console.log("Token:", tokenAddress);
console.log("Vesting:", vestingAddress);
console.log("Pagador:", payer.address);
console.log("Beneficiario A:", beneficiaryA.address);
console.log("Beneficiario B:", beneficiaryB.address);
