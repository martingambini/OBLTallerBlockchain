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
    startTime,
    endTime,
    true,
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: createHash,
  });

  assert.equal(receipt.status, "success");

  const agreement = await vesting.read.getAgreement([0n]);


  assert.equal(agreement.payer.toLowerCase(), payer.account.address.toLowerCase());

  assert.equal(
    agreement.beneficiary.toLowerCase(),
    beneficiary.account.address.toLowerCase(),
  );

  assert.equal(agreement.totalAmount, amount);

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

  const agreement = await vesting.read.getAgreement([0n]);
  assert.equal(agreement.claimedAmount, half);

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

  const finalAgreement = await vesting.read.getAgreement([0n]);
  assert.equal(finalAgreement.status, 1);

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

const DAY = 24n * 60n * 60n;

async function setupAgreement(
  opts: { amount?: bigint; duration?: bigint; revocable?: boolean } = {},
) {
  const amount = opts.amount ?? parseUnits("3000", 18);
  const duration = opts.duration ?? 30n * DAY;
  const revocable = opts.revocable ?? true;

  const { viem } = await network.connect();
  const [payer, beneficiary, stranger] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();

  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");

  const block = await publicClient.getBlock();
  const startTime = block.timestamp + 3600n;
  const endTime = startTime + duration;

  await token.write.approve([vesting.address, amount]);
  await vesting.write.createAgreement([
    beneficiary.account.address,
    token.address,
    amount,
    startTime,
    startTime,
    endTime,
    revocable,
  ]);

  return {
    payer,
    beneficiary,
    stranger,
    publicClient,
    testClient,
    token,
    vesting,
    amount,
    duration,
    startTime,
    startTime,
    endTime,
  };
}

test("Cancelación válida: devuelve lo no devengado al pagador y congela lo devengado", async () => {
  const s = await setupAgreement();
  const half = s.amount / 2n;

  const payerBefore = await s.token.read.balanceOf([s.payer.account.address]);

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 2n,
  });
  const hash = await s.vesting.write.cancel([0n]);
  const receipt = await s.publicClient.waitForTransactionReceipt({ hash });

  const payerAfter = await s.token.read.balanceOf([s.payer.account.address]);
  assert.equal(payerAfter - payerBefore, half);

  assert.equal(await s.token.read.balanceOf([s.vesting.address]), half);

  const agreement = await s.vesting.read.getAgreement([0n]);
  assert.equal(agreement.status, 2);
  assert.equal(agreement.vestedAtCancel, half);

  const events = await s.vesting.getEvents.AgreementCancelled(
    {},
    { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber },
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].args.agreementId, 0n);
  assert.equal(
    events[0].args.payer?.toLowerCase(),
    s.payer.account.address.toLowerCase(),
  );
  assert.equal(events[0].args.vestedAmount, half);
  assert.equal(events[0].args.refundedAmount, half);
});

test("Tras cancelar, el beneficiario reclama lo devengado y el devengado ya no crece", async () => {
  const s = await setupAgreement();
  const half = s.amount / 2n;

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 2n,
  });
  await s.vesting.write.cancel([0n]);

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.endTime + DAY,
  });
  await s.testClient.mine({ blocks: 1 });

  assert.equal(await s.vesting.read.vestedAmount([0n]), half);
  assert.equal(await s.vesting.read.claimableAmount([0n]), half);

  await s.vesting.write.claim([0n], { account: s.beneficiary.account });

  assert.equal(
    await s.token.read.balanceOf([s.beneficiary.account.address]),
    half,
  );
  const agreement = await s.vesting.read.getAgreement([0n]);
  assert.equal(agreement.status, 2);
  assert.equal(agreement.claimedAmount, half);

  assert.equal(await s.token.read.balanceOf([s.vesting.address]), 0n);

  await assert.rejects(
    s.vesting.write.claim([0n], { account: s.beneficiary.account }),
    /NothingToClaim/,
  );
});

test("Cancelar después de un reclamo parcial respeta lo ya retirado", async () => {
  const s = await setupAgreement();

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 4n,
  });
  await s.vesting.write.claim([0n], { account: s.beneficiary.account });
  const quarter = parseUnits("750", 18);
  assert.equal(
    await s.token.read.balanceOf([s.beneficiary.account.address]),
    quarter,
  );

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 2n,
  });
  await s.vesting.write.cancel([0n]);

  assert.equal(await s.vesting.read.claimableAmount([0n]), quarter);

  await s.vesting.write.claim([0n], { account: s.beneficiary.account });
  assert.equal(
    await s.token.read.balanceOf([s.beneficiary.account.address]),
    parseUnits("1500", 18),
  );
  assert.equal(await s.token.read.balanceOf([s.vesting.address]), 0n);
});

test("Cancelar antes del inicio devuelve todo al pagador", async () => {
  const s = await setupAgreement();

  const payerBefore = await s.token.read.balanceOf([s.payer.account.address]);

  await s.testClient.setNextBlockTimestamp({ timestamp: s.startTime - 10n });
  await s.vesting.write.cancel([0n]);

  const payerAfter = await s.token.read.balanceOf([s.payer.account.address]);
  assert.equal(payerAfter - payerBefore, s.amount);
  assert.equal(await s.token.read.balanceOf([s.vesting.address]), 0n);
  assert.equal(await s.vesting.read.vestedAmount([0n]), 0n);

  await assert.rejects(
    s.vesting.write.claim([0n], { account: s.beneficiary.account }),
    /NothingToClaim/,
  );
});

test("Redondeo al cancelar: reclamado + devuelto = depositado, sin retirar de más", async () => {
  const s = await setupAgreement({ amount: 100n, duration: 3n });

  await s.testClient.setNextBlockTimestamp({ timestamp: s.startTime + 1n });
  const payerBefore = await s.token.read.balanceOf([s.payer.account.address]);
  await s.vesting.write.cancel([0n]);

  const refund =
    (await s.token.read.balanceOf([s.payer.account.address])) - payerBefore;
  assert.equal(refund, 67n);
  assert.equal(await s.vesting.read.vestedAmount([0n]), 33n);

  await s.vesting.write.claim([0n], { account: s.beneficiary.account });
  const claimed = await s.token.read.balanceOf([s.beneficiary.account.address]);
  assert.equal(claimed, 33n);

  assert.equal(claimed + refund, s.amount);
  assert.equal(await s.token.read.balanceOf([s.vesting.address]), 0n);
});

test("Solo el pagador puede cancelar", async () => {
  const s = await setupAgreement();

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 2n,
  });

  await assert.rejects(
    s.vesting.write.cancel([0n], { account: s.beneficiary.account }),
    /Unauthorized/,
  );

  await assert.rejects(
    s.vesting.write.cancel([0n], { account: s.stranger.account }),
    /Unauthorized/,
  );

  const agreement = await s.vesting.read.getAgreement([0n]);
  assert.equal(agreement.status, 0);
});

test("No se puede cancelar un acuerdo no revocable", async () => {
  const s = await setupAgreement({ revocable: false });

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 2n,
  });

  await assert.rejects(s.vesting.write.cancel([0n]), /NotRevocable/);

  const agreement = await s.vesting.read.getAgreement([0n]);
  assert.equal(agreement.status, 0);
  assert.equal(await s.token.read.balanceOf([s.vesting.address]), s.amount);
});

test("No se puede cancelar dos veces", async () => {
  const s = await setupAgreement();

  await s.testClient.setNextBlockTimestamp({
    timestamp: s.startTime + s.duration / 2n,
  });
  await s.vesting.write.cancel([0n]);

  await assert.rejects(s.vesting.write.cancel([0n]), /AgreementNotActive/);
});

test("No se puede cancelar cuando el período ya terminó", async () => {
  const s = await setupAgreement();

  await s.testClient.setNextBlockTimestamp({ timestamp: s.endTime });

  await assert.rejects(s.vesting.write.cancel([0n]), /VestingAlreadyEnded/);

  await s.testClient.setNextBlockTimestamp({ timestamp: s.endTime + 1n });
  await s.testClient.mine({ blocks: 1 });
  assert.equal(await s.vesting.read.claimableAmount([0n]), s.amount);
});

test("No se puede cancelar un acuerdo inexistente", async () => {
  const s = await setupAgreement();

  await assert.rejects(s.vesting.write.cancel([99n]), /AgreementNotFound/);
});
