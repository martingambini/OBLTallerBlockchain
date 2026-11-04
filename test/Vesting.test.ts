import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";


test("Debe crear un acuerdo y bloquear los tokens", async () => {
  // Conectar a la blockchain local de Hardhat
  const { viem } = await network.connect();

  // Obtener dos cuentas de prueba
  const [payer, beneficiary] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  // Desplegar ambos contratos
  const token = await viem.deployContract("MockToken");
  const vesting = await viem.deployContract("Vesting");

  // Definir el salario
  const amount = parseUnits("3000", 18);

  // Obtener el tiempo actual de blockchain
  const block = await publicClient.getBlock();
  const startTime = block.timestamp + 60n;
  const endTime = startTime + 30n * 24n * 60n * 60n;

  // Autorizar al contrato Vesting a usar 3000 ORT
  const approveHash = await token.write.approve([vesting.address, amount]);

  await publicClient.waitForTransactionReceipt({
    hash: approveHash,
  });

  // Crear el acuerdo salarial
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

  // Obtener el acuerdo creado
  const agreement = await vesting.read.agreements([0n]);

  // Verificar datos

  assert.equal(agreement[0].toLowerCase(), payer.account.address.toLowerCase());

  assert.equal(
    agreement[1].toLowerCase(),
    beneficiary.account.address.toLowerCase(),
  );

  assert.equal(agreement[3], amount);

  // Verificar los tokens bloqueados
  const balance = await token.read.balanceOf([vesting.address]);

  assert.equal(balance, amount);

  // Verificar que se creó un único acuerdo
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

  await token.write.approve([
    vesting.address,
    amount
  ]);

  await vesting.write.createAgreement([
    beneficiary.account.address,
    token.address,
    amount,
    startTime,
    endTime,
    true
  ]);

  // TEST 1: Antes del inicio
  let vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, 0n);

  // TEST 2: Mitad del período (día 15)
  await testClient.setNextBlockTimestamp({
    timestamp: startTime + duration / 2n
  });
  await testClient.mine({ blocks: 1 });

  vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, parseUnits("1500", 18));

  // TEST 3: Fin del período (día 30)
  await testClient.setNextBlockTimestamp({
    timestamp: endTime
  });
  await testClient.mine({ blocks: 1 });

  vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, amount);

  // TEST 4: Después del final
  await testClient.setNextBlockTimestamp({
    timestamp: endTime + 86400n
  });
  await testClient.mine({ blocks: 1 });

  vested = await vesting.read.vestedAmount([0n]);
  assert.equal(vested, amount);

  // TEST 5: Disponible para reclamar
  const claimable = await vesting.read.claimableAmount([0n]);
  assert.equal(claimable, amount);
});


  // Ningún acuerdo inválido debe quedar registrado
  const nextId = await vesting.read.nextAgreementId();

  assert.equal(nextId, 0n);
});
