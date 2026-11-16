import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();
const { loadFixture } = networkHelpers;

async function deployFixture() {
  const [deployer, alice, bob] = await ethers.getSigners();
  const token = await ethers.deployContract("MockToken");
  return { deployer, alice, bob, token };
}

describe("MockToken", function () {
  it("tiene nombre, símbolo y 6 decimales como una stablecoin", async function () {
    const { token } = await loadFixture(deployFixture);

    expect(await token.name()).to.equal("ORT USD");
    expect(await token.symbol()).to.equal("OUSD");
    expect(await token.decimals()).to.equal(6n);
  });

  it("el supply inicial va completo a quien despliega", async function () {
    const { deployer, token } = await loadFixture(deployFixture);
    const decimals = await token.decimals();
    const expected = 1000000n * 10n ** decimals;

    expect(await token.totalSupply()).to.equal(expected);
    expect(await token.balanceOf(deployer.address)).to.equal(expected);
  });

  it("cualquier cuenta puede acuñar tokens a cualquier dirección", async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);
    const supplyBefore = await token.totalSupply();
    const amount = 5000n * 10n ** 6n;

    await token.connect(alice).mint(bob.address, amount);

    expect(await token.balanceOf(bob.address)).to.equal(amount);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(supplyBefore + amount);
  });

  it("se pueden acuñar montos muy grandes", async function () {
    const { alice, token } = await loadFixture(deployFixture);
    const huge = 2n ** 128n - 1n;

    await token.mint(alice.address, huge);

    expect(await token.balanceOf(alice.address)).to.equal(huge);
  });

  it("una cuenta fondeada con mint puede transferir lo recibido", async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);
    const amount = 100n * 10n ** 6n;

    await token.mint(alice.address, amount);
    await token.connect(alice).transfer(bob.address, amount / 4n);

    expect(await token.balanceOf(alice.address)).to.equal(
      amount - amount / 4n,
    );
    expect(await token.balanceOf(bob.address)).to.equal(amount / 4n);
  });
});
