import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";

test("Debe crear un acuerdo y bloquear los tokens", async () => {

  const { viem } = await network.connect();

  const [payer, beneficiary] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");

  const amount = parseUnits("3000", 18);

  const block = await publicClient.getBlock();
  const startTime = block.timestamp + 60n;
  const endTime = startTime + 30n * 24n * 60n * 60n;

  const approveHash = await token.write.approve([vesting.address, amount]);

  await publicClient.waitForTransactionReceipt({
    hash: approveHash,
  });

  const createHash = await vesting.write.createAgreement([
    beneficiary.account.address,
    token.address,
    amount,
    startTime,
    endTime,
    true,
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: createHash,
  });

  assert.equal(receipt.status, "success");

  const agreement = await vesting.read.agreements([0n]);


  assert.equal(agreement[0].toLowerCase(), payer.account.address.toLowerCase());

  assert.equal(
    agreement[1].toLowerCase(),
    beneficiary.account.address.toLowerCase(),
  );

  assert.equal(agreement[3], amount);

  const balance = await token.read.balanceOf([vesting.address]);

  assert.equal(balance, amount);

  const nextId = await vesting.read.nextAgreementId();
  assert.equal(nextId, 1n);
});

test("Debe rechazar acuerdos inválidos", async () => {
  const { viem } = await network.connect();

  const [, beneficiary] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");

  const amount = parseUnits("3000", 18);

  const block = await publicClient.getBlock();
  const startTime = block.timestamp + 3600n;
  const endTime = startTime + 86400n;

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  // TEST 1: Beneficiario inválido
  await assert.rejects(
    vesting.write.createAgreement([
      zeroAddress,
      token.address,
      amount,
      startTime,
      endTime,
      true,
    ]),
  );

  // TEST 2: Monto cero
  await assert.rejects(
    vesting.write.createAgreement([
      beneficiary.account.address,
      token.address,
      0n,
      startTime,
      endTime,
      true,
    ]),
  );

  // TEST 3: Fecha final igual a la inicial
  await assert.rejects(
    vesting.write.createAgreement([
      beneficiary.account.address,
      token.address,
      amount,
      startTime,
      startTime,
      true,
    ]),
  );

  // TEST 4: Fecha final anterior a la inicial
  await assert.rejects(
    vesting.write.createAgreement([
      beneficiary.account.address,
      token.address,
      amount,
      endTime,
      startTime,
      true,
    ]),
  );

  // TEST 5: Token inválido
  await assert.rejects(
    vesting.write.createAgreement([
      beneficiary.account.address,
      zeroAddress,
      amount,
      startTime,
      endTime,
      true,
    ]),
  );

  // TEST 6: Sin approve (allowance insuficiente)
  await assert.rejects(
    vesting.write.createAgreement([
      beneficiary.account.address,
      token.address,
      amount,
      startTime,
      endTime,
      true,
    ]),
  );

  const nextId = await vesting.read.nextAgreementId();

  assert.equal(nextId, 0n);
});

test("Debe calcular correctamente el vesting lineal", async () => {
  const { viem } = await network.connect();

  const [, beneficiary] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();

  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");

  const amount = parseUnits("3000", 18);

  const block = await publicClient.getBlock();

  const startTime = block.timestamp + 3600n;
  const duration = 30n * 24n * 60n * 60n;
  const endTime = startTime + duration;

  await token.write.approve([vesting.address, amount]);

  await vesting.write.createAgreement([
    beneficiary.account.address,
    token.address,
    amount,
    startTime,
    endTime,
    true,
  ]);

  // TEST 1: Antes del inicio
  let vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, 0n);

  // TEST 2: Mitad del período (día 15)
  await testClient.setNextBlockTimestamp({
    timestamp: startTime + duration / 2n,
  });
  await testClient.mine({ blocks: 1 });

  vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, parseUnits("1500", 18));

  // TEST 3: Fin del período (día 30)
  await testClient.setNextBlockTimestamp({
    timestamp: endTime,
  });
  await testClient.mine({ blocks: 1 });

  vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, amount);

  // TEST 4: Después del final
  await testClient.setNextBlockTimestamp({
    timestamp: endTime + 86400n,
  });
  await testClient.mine({ blocks: 1 });

  vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, amount);

  // TEST 5: Disponible para reclamar
  const claimable = await vesting.read.claimableAmount([0n]);
  assert.equal(claimable, amount);
});

test("Debe permitir reclamos parciales y evitar dobles retiros", async () => {
  const { viem } = await network.connect();

  const [, beneficiary, stranger] = await viem.getWalletClients();

  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();

  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");

  const amount = parseUnits("3000", 18);
  const half = parseUnits("1500", 18);

  const block = await publicClient.getBlock();
  const startTime = block.timestamp + 3600n;
  const duration = 30n * 24n * 60n * 60n;
  const endTime = startTime + duration;

  await token.write.approve([vesting.address, amount]);

  await vesting.write.createAgreement([
    beneficiary.account.address,
    token.address,
    amount,
    startTime,
    endTime,
    true,
  ]);

  await assert.rejects(
    vesting.write.claim([0n], {
      account: beneficiary.account,
    }),
  );

  await testClient.setNextBlockTimestamp({
    timestamp: startTime + duration / 2n,
  });

  const claimHash = await vesting.write.claim([0n], {
    account: beneficiary.account,
  });

  const claimReceipt = await publicClient.waitForTransactionReceipt({
    hash: claimHash,
  });

  const claimBlock = await publicClient.getBlock({
    blockNumber: claimReceipt.blockNumber,
  });

  assert.equal(claimBlock.timestamp, startTime + duration / 2n);

  const beneficiaryBalance = await token.read.balanceOf([
    beneficiary.account.address,
  ]);

  assert.equal(beneficiaryBalance, half);

  const agreement = await vesting.read.agreements([0n]);
  assert.equal(agreement[6], half);

  await assert.rejects(
    vesting.write.claim([0n], {
      account: stranger.account,
    }),
  );

  await testClient.setNextBlockTimestamp({
    timestamp: endTime,
  });

  const finalClaimHash = await vesting.write.claim([0n], {
    account: beneficiary.account,
  });

  await publicClient.waitForTransactionReceipt({
    hash: finalClaimHash,
  });

  const finalBalance = await token.read.balanceOf([
    beneficiary.account.address,
  ]);

  assert.equal(finalBalance, amount);

  const finalAgreement = await vesting.read.agreements([0n]);
  assert.equal(finalAgreement[8], 1);

  await assert.rejects(
    vesting.write.claim([0n], {
      account: beneficiary.account,
    }),
  );

  const balanceAfterDoubleClaim = await token.read.balanceOf([
    beneficiary.account.address,
  ]);
  assert.equal(balanceAfterDoubleClaim, amount);

  const vestingBalance = await token.read.balanceOf([vesting.address]);
  assert.equal(vestingBalance, 0n);
});
