import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();
const { time, loadFixture } = networkHelpers;

async function deployFixture() {
  const [payer, beneficiary] = await ethers.getSigners();
  const token = await ethers.deployContract("MockToken");
  const packed = await ethers.deployContract("PackedBaseline");
  const unpacked = await ethers.deployContract("UnpackedBaseline");
  return { payer, beneficiary, token, packed, unpacked };
}

describe("Gas: struct empaquetado vs sin empaquetar", function () {
  it("el struct empaquetado en 5 slots cuesta menos gas al crear un acuerdo", async function () {
    const { beneficiary, token, packed, unpacked } =
      await loadFixture(deployFixture);
    const tokenAddress = await token.getAddress();
    const start = BigInt(await time.latest()) + 100n;
    const end = start + 86400n * 30n;
    const args = [
      beneficiary.address,
      tokenAddress,
      1000n * 10n ** 6n,
      start,
      start,
      end,
      true,
    ] as const;

    const packedReceipt = await (await packed.create(...args)).wait();
    const unpackedReceipt = await (await unpacked.create(...args)).wait();

    const packedGas = packedReceipt!.gasUsed;
    const unpackedGas = unpackedReceipt!.gasUsed;

    console.log(`      empaquetado (5 slots):    ${packedGas} gas`);
    console.log(`      sin empaquetar (11 slots): ${unpackedGas} gas`);
    console.log(`      ahorro:                   ${unpackedGas - packedGas} gas`);

    expect(packedGas).to.be.lessThan(unpackedGas);
  });
});
