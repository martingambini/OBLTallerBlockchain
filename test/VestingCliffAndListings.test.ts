import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";

const DAY = 24n * 60n * 60n;

async function setup() {
  const { viem } = await network.connect();
  const [payer, beneficiary, other] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");
  const now = (await publicClient.getBlock()).timestamp;

  async function travelTo(timestamp: bigint) {
    await testClient.setNextBlockTimestamp({ timestamp });
    await testClient.mine({ blocks: 1 });
  }

  return {
    viem,
    payer,
    beneficiary,
    other,
    publicClient,
    testClient,
    token,
    vesting,
    now,
    travelTo,
  };
}

async function createWithCliff(
  s: Awaited<ReturnType<typeof setup>>,
  opts: {
    amount: bigint;
    startOffset: bigint;
    cliffOffset: bigint;
    duration: bigint;
    revocable?: boolean;
    beneficiary?: `0x${string}`;
  },
) {
  const startTime = s.now + opts.startOffset;
  const cliffTime = startTime + opts.cliffOffset;
  const endTime = startTime + opts.duration;

  await s.token.write.approve([s.vesting.address, opts.amount]);
  await s.vesting.write.createAgreement([
    opts.beneficiary ?? s.beneficiary.account.address,
    s.token.address,
    opts.amount,
    startTime,
    cliffTime,
    endTime,
    opts.revocable ?? true,
  ]);

  return { startTime, cliffTime, endTime };
}

test("Guarda todos los campos del acuerdo, incluido el cliff, y emite el evento", async () => {
  const s = await setup();
  const amount = parseUnits("1000", 18);
  const startTime = s.now + 100n;
  const cliffTime = startTime + 10n * DAY;
  const endTime = startTime + 100n * DAY;

  await s.token.write.approve([s.vesting.address, amount]);
  const hash = await s.vesting.write.createAgreement([
    s.beneficiary.account.address,
    s.token.address,
    amount,
    startTime,
    cliffTime,
    endTime,
    false,
  ]);
  const receipt = await s.publicClient.waitForTransactionReceipt({ hash });

  const agreement = await s.vesting.read.getAgreement([0n]);
  assert.equal(
    agreement.payer.toLowerCase(),
    s.payer.account.address.toLowerCase(),
  );
  assert.equal(
    agreement.beneficiary.toLowerCase(),
    s.beneficiary.account.address.toLowerCase(),
  );
  assert.equal(agreement.token.toLowerCase(), s.token.address.toLowerCase());
  assert.equal(agreement.totalAmount, amount);
  assert.equal(agreement.claimedAmount, 0n);
  assert.equal(agreement.vestedAtCancel, 0n);
  assert.equal(BigInt(agreement.startTime), startTime);
  assert.equal(BigInt(agreement.cliffTime), cliffTime);
  assert.equal(BigInt(agreement.endTime), endTime);
  assert.equal(agreement.revocable, false);
  assert.equal(agreement.status, 0);

  const events = await s.vesting.getEvents.AgreementCreated(
    {},
    { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber },
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].args.agreementId, 0n);
  assert.equal(events[0].args.totalAmount, amount);
  assert.equal(events[0].args.startTime, startTime);
  assert.equal(events[0].args.cliffTime, cliffTime);
  assert.equal(events[0].args.endTime, endTime);
  assert.equal(events[0].args.revocable, false);
});

test("Antes del cliff no se devenga nada; en el cliff se devenga lo lineal desde el inicio", async () => {
  const s = await setup();
  const amount = parseUnits("1000", 18);
  const { startTime, cliffTime } = await createWithCliff(s, {
    amount,
    startOffset: 100n,
    cliffOffset: 30n * DAY,
    duration: 100n * DAY,
  });

  await s.travelTo(cliffTime - 2n);
  assert.equal(await s.vesting.read.vestedAmount([0n]), 0n);
  assert.equal(await s.vesting.read.claimableAmount([0n]), 0n);

  await assert.rejects(
    s.vesting.write.claim([0n], { account: s.beneficiary.account }),
    /NothingToClaim/,
  );

  await s.testClient.setNextBlockTimestamp({ timestamp: cliffTime });
  await s.vesting.write.claim([0n], { account: s.beneficiary.account });
  assert.equal(
    await s.token.read.balanceOf([s.beneficiary.account.address]),
    parseUnits("300", 18),
  );

  await s.travelTo(startTime + 50n * DAY);
  assert.equal(
    await s.vesting.read.vestedAmount([0n]),
    parseUnits("500", 18),
  );
  assert.equal(
    await s.vesting.read.claimableAmount([0n]),
    parseUnits("200", 18),
  );
});

test("Con el cliff igual al fin no se devenga nada hasta el final", async () => {
  const s = await setup();
  const amount = parseUnits("1000", 18);
  const { endTime } = await createWithCliff(s, {
    amount,
    startOffset: 100n,
    cliffOffset: 10n * DAY,
    duration: 10n * DAY,
  });

  await s.travelTo(endTime - 1n);
  assert.equal(await s.vesting.read.vestedAmount([0n]), 0n);

  await s.travelTo(endTime);
  assert.equal(await s.vesting.read.vestedAmount([0n]), amount);
});

test("Cancelar antes del cliff devuelve todo al pagador", async () => {
  const s = await setup();
  const amount = parseUnits("1000", 18);
  const { startTime } = await createWithCliff(s, {
    amount,
    startOffset: 100n,
    cliffOffset: 30n * DAY,
    duration: 100n * DAY,
  });

  const payerBefore = await s.token.read.balanceOf([s.payer.account.address]);

  await s.testClient.setNextBlockTimestamp({ timestamp: startTime + 10n * DAY });
  await s.vesting.write.cancel([0n]);

  const payerAfter = await s.token.read.balanceOf([s.payer.account.address]);
  assert.equal(payerAfter - payerBefore, amount);
  assert.equal(await s.vesting.read.vestedAmount([0n]), 0n);
  assert.equal(await s.token.read.balanceOf([s.vesting.address]), 0n);
});

test("Rechaza un cliff fuera del rango [inicio, fin]", async () => {
  const s = await setup();
  const amount = parseUnits("1000", 18);
  const startTime = s.now + 100n;
  const endTime = startTime + 10n * DAY;

  await s.token.write.approve([s.vesting.address, amount]);

  await assert.rejects(
    s.vesting.write.createAgreement([
      s.beneficiary.account.address,
      s.token.address,
      amount,
      startTime,
      startTime - 1n,
      endTime,
      true,
    ]),
    /InvalidCliff/,
  );

  await assert.rejects(
    s.vesting.write.createAgreement([
      s.beneficiary.account.address,
      s.token.address,
      amount,
      startTime,
      endTime + 1n,
      endTime,
      true,
    ]),
    /InvalidCliff/,
  );

  assert.equal(await s.vesting.read.nextAgreementId(), 0n);
});

test("Rechaza montos y fechas que no entran en el struct empaquetado", async () => {
  const s = await setup();
  const startTime = s.now + 100n;
  const endTime = startTime + DAY;

  await assert.rejects(
    s.vesting.write.createAgreement([
      s.beneficiary.account.address,
      s.token.address,
      2n ** 128n,
      startTime,
      startTime,
      endTime,
      true,
    ]),
    /AmountTooLarge/,
  );

  await assert.rejects(
    s.vesting.write.createAgreement([
      s.beneficiary.account.address,
      s.token.address,
      1n,
      startTime,
      startTime,
      2n ** 48n,
      true,
    ]),
    /InvalidTimeRange/,
  );
});

test("Rechaza tokens que cobran comisión al transferir", async () => {
  const s = await setup();
  const feeToken = await s.viem.deployContract("FeeOnTransferToken");
  const amount = parseUnits("1000", 18);
  const startTime = s.now + 100n;
  const endTime = startTime + 10n * DAY;

  await feeToken.write.approve([s.vesting.address, amount]);

  await assert.rejects(
    s.vesting.write.createAgreement([
      s.beneficiary.account.address,
      feeToken.address,
      amount,
      startTime,
      startTime,
      endTime,
      true,
    ]),
    /UnsupportedToken/,
  );

  assert.equal(await s.vesting.read.nextAgreementId(), 0n);
  assert.equal(await feeToken.read.balanceOf([s.vesting.address]), 0n);
  assert.equal(
    await s.vesting.read.agreementCountByPayer([s.payer.account.address]),
    0n,
  );
});

test("Las consultas por id inexistente revierten con AgreementNotFound", async () => {
  const s = await setup();

  await assert.rejects(s.vesting.read.getAgreement([0n]), /AgreementNotFound/);
  await assert.rejects(s.vesting.read.vestedAmount([0n]), /AgreementNotFound/);
  await assert.rejects(
    s.vesting.read.claimableAmount([0n]),
    /AgreementNotFound/,
  );
  await assert.rejects(
    s.vesting.write.claim([0n], { account: s.beneficiary.account }),
    /AgreementNotFound/,
  );
});

test("Listados por pagador y por beneficiario con paginación", async () => {
  const s = await setup();
  const amount = parseUnits("10", 18);

  await s.token.write.approve([s.vesting.address, amount * 3n]);
  const startTime = s.now + 100n;
  const endTime = startTime + DAY;

  for (const to of [
    s.beneficiary.account.address,
    s.other.account.address,
    s.beneficiary.account.address,
  ]) {
    await s.vesting.write.createAgreement([
      to,
      s.token.address,
      amount,
      startTime,
      startTime,
      endTime,
      true,
    ]);
  }

  const payerAddress = s.payer.account.address;
  const beneficiaryAddress = s.beneficiary.account.address;
  const otherAddress = s.other.account.address;

  assert.equal(await s.vesting.read.agreementCountByPayer([payerAddress]), 3n);
  assert.equal(
    await s.vesting.read.agreementCountByBeneficiary([beneficiaryAddress]),
    2n,
  );
  assert.equal(
    await s.vesting.read.agreementCountByBeneficiary([otherAddress]),
    1n,
  );
  assert.equal(await s.vesting.read.agreementCountByPayer([otherAddress]), 0n);

  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([payerAddress, 0n, 10n]),
    [0n, 1n, 2n],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByBeneficiary([
      beneficiaryAddress,
      0n,
      10n,
    ]),
    [0n, 2n],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByBeneficiary([otherAddress, 0n, 10n]),
    [1n],
  );

  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([payerAddress, 1n, 1n]),
    [1n],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([payerAddress, 2n, 10n]),
    [2n],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([payerAddress, 3n, 10n]),
    [],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([payerAddress, 0n, 0n]),
    [],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([payerAddress, 1n, 2n ** 256n - 1n]),
    [1n, 2n],
  );
  assert.deepEqual(
    await s.vesting.read.getAgreementIdsByPayer([otherAddress, 0n, 10n]),
    [],
  );
});
