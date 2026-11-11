import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { network } from "hardhat";

const { ethers } = await network.connect();

const OUTPUT_DIR = path.join("frontend", "src", "contracts");
const DEPLOYMENTS_FILE = path.join(OUTPUT_DIR, "deployments.json");
const ABI_DIR = path.join(OUTPUT_DIR, "abi");

const CONTRACTS = [
  { name: "Vesting", source: "Vesting.sol", key: "VestingModule#Vesting" },
  { name: "MockToken", source: "MockToken.sol", key: "VestingModule#MockToken" },
];

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf-8"));
}

const chainId = Number((await ethers.provider.getNetwork()).chainId);
const addressesFile = path.join(
  "ignition",
  "deployments",
  `chain-${chainId}`,
  "deployed_addresses.json",
);

let addresses: Record<string, string>;
try {
  addresses = await readJson(addressesFile);
} catch {
  throw new Error(
    `No se encontró ${addressesFile}. Desplegá primero con el módulo de Ignition.`,
  );
}

await mkdir(ABI_DIR, { recursive: true });

let deployments: Record<string, Record<string, string>> = {};
try {
  deployments = await readJson(DEPLOYMENTS_FILE);
} catch {
  deployments = {};
}

deployments[chainId] = {};

for (const contract of CONTRACTS) {
  const address = addresses[contract.key];
  if (!address) {
    throw new Error(`Falta la dirección de ${contract.key} en ${addressesFile}`);
  }

  const artifact = await readJson(
    path.join("artifacts", "contracts", contract.source, `${contract.name}.json`),
  );

  await writeFile(
    path.join(ABI_DIR, `${contract.name}.json`),
    JSON.stringify(artifact.abi, null, 2) + "\n",
  );
  deployments[chainId][contract.name] = address;
}

await writeFile(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2) + "\n");

console.log(`Exportado para chainId ${chainId}:`);
console.log(deployments[chainId]);
