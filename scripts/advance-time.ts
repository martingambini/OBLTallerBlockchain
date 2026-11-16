import { network } from "hardhat";

const { ethers } = await network.connect();

const days = Number(process.env.DAYS ?? "1");
const seconds = Math.round(days * 24 * 60 * 60);

await ethers.provider.send("evm_increaseTime", [seconds]);
await ethers.provider.send("evm_mine", []);

const block = await ethers.provider.getBlock("latest");
console.log(
  `Avanzado ${days} día(s). Hora de la cadena: ${new Date(
    Number(block!.timestamp) * 1000,
  ).toISOString()}`,
);
