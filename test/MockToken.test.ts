import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

async function setup() {
  const { viem } = await network.connect();
  const [deployer, alice, bob] = await viem.getWalletClients();
  const token = await viem.deployContract("MockToken");
  return { deployer, alice, bob, token };
}

test("Tiene nombre, símbolo y 6 decimales como una stablecoin", async () => {
  const { token } = await setup();

  assert.equal(await token.read.name(), "ORT USD");
  assert.equal(await token.read.symbol(), "OUSD");
  assert.equal(await token.read.decimals(), 6);
});

test("El supply inicial va completo a quien despliega", async () => {
  const { deployer, token } = await setup();
  const decimals = await token.read.decimals();
  const expected = 1000000n * 10n ** BigInt(decimals);

  assert.equal(await token.read.totalSupply(), expected);
  assert.equal(
    await token.read.balanceOf([deployer.account.address]),
    expected,
  );
});

test("Cualquier cuenta puede acuñar tokens a cualquier dirección", async () => {
  const { alice, bob, token } = await setup();
  const supplyBefore = await token.read.totalSupply();
  const amount = 5000n * 10n ** 6n;

  await token.write.mint([bob.account.address, amount], {
    account: alice.account,
  });

  assert.equal(await token.read.balanceOf([bob.account.address]), amount);
  assert.equal(await token.read.balanceOf([alice.account.address]), 0n);
  assert.equal(await token.read.totalSupply(), supplyBefore + amount);
});

test("Se pueden acuñar montos muy grandes", async () => {
  const { alice, token } = await setup();
  const huge = 2n ** 128n - 1n;

  await token.write.mint([alice.account.address, huge]);

  assert.equal(await token.read.balanceOf([alice.account.address]), huge);
});

test("Una cuenta fondeada con mint puede transferir lo recibido", async () => {
  const { alice, bob, token } = await setup();
  const amount = 100n * 10n ** 6n;

  await token.write.mint([alice.account.address, amount]);
  await token.write.transfer([bob.account.address, amount / 4n], {
    account: alice.account,
  });

  assert.equal(
    await token.read.balanceOf([alice.account.address]),
    amount - amount / 4n,
  );
  assert.equal(await token.read.balanceOf([bob.account.address]), amount / 4n);
});
