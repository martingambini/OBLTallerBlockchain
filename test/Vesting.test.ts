import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();
const { time, loadFixture } = networkHelpers;

const DECIMALS = 6;
const DAY = 24n * 60n * 60n;

const units = (value: string) => ethers.parseUnits(value, DECIMALS);

async function now() {
  return BigInt(await time.latest());
}

async function deployFixture() {
  const [payer, beneficiary, stranger] = await ethers.getSigners();
  const token = await ethers.deployContract("MockToken");
  const vesting = await ethers.deployContract("Vesting");
  return { payer, beneficiary, stranger, token, vesting };
}

type Context = Awaited<ReturnType<typeof deployFixture>>;

async function createAgreement(
  ctx: Context,
  opts: { amount?: bigint; duration?: bigint; revocable?: boolean } = {},
) {
  const amount = opts.amount ?? units("3000");
  const duration = opts.duration ?? 30n * DAY;
  const revocable = opts.revocable ?? true;

  const startTime = (await now()) + 3600n;
  const endTime = startTime + duration;

  await ctx.token.approve(await ctx.vesting.getAddress(), amount);
  await ctx.vesting.createAgreement(
    ctx.beneficiary.address,
    await ctx.token.getAddress(),
    amount,
    startTime,
    startTime,
    endTime,
    revocable,
  );

  return { amount, duration, startTime, endTime };
}

describe("Vesting", function () {
  describe("creación de acuerdos", function () {
    it("crea un acuerdo y bloquea los tokens", async function () {
      const { payer, beneficiary, token, vesting } =
        await loadFixture(deployFixture);

      const amount = units("3000");
      const startTime = (await now()) + 60n;
      const endTime = startTime + 30n * DAY;

      await token.approve(await vesting.getAddress(), amount);

      await vesting.createAgreement(
        beneficiary.address,
        await token.getAddress(),
        amount,
        startTime,
        startTime,
        endTime,
        true,
      );

      const agreement = await vesting.getAgreement(0);

      expect(agreement.payer).to.equal(payer.address);
      expect(agreement.beneficiary).to.equal(beneficiary.address);
      expect(agreement.totalAmount).to.equal(amount);

      expect(await token.balanceOf(await vesting.getAddress())).to.equal(
        amount,
      );

      expect(await vesting.nextAgreementId()).to.equal(1n);
    });

    it("rechaza acuerdos inválidos", async function () {
      const { beneficiary, token, vesting } = await loadFixture(deployFixture);

      const amount = units("3000");
      const startTime = (await now()) + 3600n;
      const endTime = startTime + 86400n;

      const tokenAddress = await token.getAddress();

      // TEST 1: Beneficiario inválido
      await expect(
        vesting.createAgreement(
          ethers.ZeroAddress,
          tokenAddress,
          amount,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidBeneficiary");

      // TEST 2: Monto cero
      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          0,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidAmount");

      // TEST 3: Fecha final igual a la inicial
      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          amount,
          startTime,
          startTime,
          startTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidTimeRange");

      // TEST 4: Fecha final anterior a la inicial
      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          amount,
          endTime,
          endTime,
          startTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidTimeRange");

      // TEST 5: Token inválido
      await expect(
        vesting.createAgreement(
          beneficiary.address,
          ethers.ZeroAddress,
          amount,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidToken");

      // TEST 6: Sin approve (allowance insuficiente)
      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          amount,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");

      expect(await vesting.nextAgreementId()).to.equal(0n);
    });
  });

  describe("devengado lineal", function () {
    it("calcula correctamente el vesting lineal", async function () {
      const ctx = await loadFixture(deployFixture);
      const { vesting } = ctx;
      const { amount, duration, startTime, endTime } =
        await createAgreement(ctx);

      // TEST 1: Antes del inicio
      expect(await vesting.vestedAmount(0)).to.equal(0n);

      // TEST 2: Mitad del período (día 15)
      await time.increaseTo(startTime + duration / 2n);
      expect(await vesting.vestedAmount(0)).to.equal(units("1500"));

      // TEST 3: Fin del período (día 30)
      await time.increaseTo(endTime);
      expect(await vesting.vestedAmount(0)).to.equal(amount);

      // TEST 4: Después del final
      await time.increaseTo(endTime + DAY);
      expect(await vesting.vestedAmount(0)).to.equal(amount);

      // TEST 5: Disponible para reclamar
      expect(await vesting.claimableAmount(0)).to.equal(amount);
    });
  });

  describe("reclamos", function () {
    it("permite reclamos parciales y evita dobles retiros", async function () {
      const ctx = await loadFixture(deployFixture);
      const { beneficiary, stranger, token, vesting } = ctx;
      const { amount, duration, startTime, endTime } =
        await createAgreement(ctx);
      const half = units("1500");

      await expect(
        vesting.connect(beneficiary).claim(0),
      ).to.be.revertedWithCustomError(vesting, "NothingToClaim");

      await time.setNextBlockTimestamp(startTime + duration / 2n);

      await expect(vesting.connect(beneficiary).claim(0))
        .to.emit(vesting, "TokensClaimed")
        .withArgs(0n, beneficiary.address, half);

      expect(await now()).to.equal(startTime + duration / 2n);
      expect(await token.balanceOf(beneficiary.address)).to.equal(half);
      expect((await vesting.getAgreement(0)).claimedAmount).to.equal(half);

      await expect(
        vesting.connect(stranger).claim(0),
      ).to.be.revertedWithCustomError(vesting, "Unauthorized");

      await time.setNextBlockTimestamp(endTime);
      await vesting.connect(beneficiary).claim(0);

      expect(await token.balanceOf(beneficiary.address)).to.equal(amount);
      expect((await vesting.getAgreement(0)).status).to.equal(1n);

      await expect(
        vesting.connect(beneficiary).claim(0),
      ).to.be.revertedWithCustomError(vesting, "AgreementCompleted");

      expect(await token.balanceOf(beneficiary.address)).to.equal(amount);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
    });
  });

  describe("cancelación", function () {
    it("devuelve lo no devengado al pagador y congela lo devengado", async function () {
      const ctx = await loadFixture(deployFixture);
      const { payer, token, vesting } = ctx;
      const { amount, duration, startTime } = await createAgreement(ctx);
      const half = amount / 2n;

      const payerBefore = await token.balanceOf(payer.address);

      await time.setNextBlockTimestamp(startTime + duration / 2n);
      await expect(vesting.cancel(0))
        .to.emit(vesting, "AgreementCancelled")
        .withArgs(0n, payer.address, half, half);

      const payerAfter = await token.balanceOf(payer.address);
      expect(payerAfter - payerBefore).to.equal(half);

      expect(await token.balanceOf(await vesting.getAddress())).to.equal(half);

      const agreement = await vesting.getAgreement(0);
      expect(agreement.status).to.equal(2n);
      expect(agreement.vestedAtCancel).to.equal(half);
    });

    it("tras cancelar, el beneficiario reclama lo devengado y el devengado ya no crece", async function () {
      const ctx = await loadFixture(deployFixture);
      const { beneficiary, token, vesting } = ctx;
      const { amount, duration, startTime, endTime } =
        await createAgreement(ctx);
      const half = amount / 2n;

      await time.setNextBlockTimestamp(startTime + duration / 2n);
      await vesting.cancel(0);

      await time.increaseTo(endTime + DAY);

      expect(await vesting.vestedAmount(0)).to.equal(half);
      expect(await vesting.claimableAmount(0)).to.equal(half);

      await vesting.connect(beneficiary).claim(0);

      expect(await token.balanceOf(beneficiary.address)).to.equal(half);

      const agreement = await vesting.getAgreement(0);
      expect(agreement.status).to.equal(2n);
      expect(agreement.claimedAmount).to.equal(half);

      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);

      await expect(
        vesting.connect(beneficiary).claim(0),
      ).to.be.revertedWithCustomError(vesting, "NothingToClaim");
    });

    it("cancelar después de un reclamo parcial respeta lo ya retirado", async function () {
      const ctx = await loadFixture(deployFixture);
      const { beneficiary, token, vesting } = ctx;
      const { duration, startTime } = await createAgreement(ctx);
      const quarter = units("750");

      await time.setNextBlockTimestamp(startTime + duration / 4n);
      await vesting.connect(beneficiary).claim(0);
      expect(await token.balanceOf(beneficiary.address)).to.equal(quarter);

      await time.setNextBlockTimestamp(startTime + duration / 2n);
      await vesting.cancel(0);

      expect(await vesting.claimableAmount(0)).to.equal(quarter);

      await vesting.connect(beneficiary).claim(0);
      expect(await token.balanceOf(beneficiary.address)).to.equal(
        units("1500"),
      );
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
    });

    it("cancelar antes del inicio devuelve todo al pagador", async function () {
      const ctx = await loadFixture(deployFixture);
      const { payer, beneficiary, token, vesting } = ctx;
      const { amount, startTime } = await createAgreement(ctx);

      const payerBefore = await token.balanceOf(payer.address);

      await time.setNextBlockTimestamp(startTime - 10n);
      await vesting.cancel(0);

      const payerAfter = await token.balanceOf(payer.address);
      expect(payerAfter - payerBefore).to.equal(amount);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
      expect(await vesting.vestedAmount(0)).to.equal(0n);

      await expect(
        vesting.connect(beneficiary).claim(0),
      ).to.be.revertedWithCustomError(vesting, "NothingToClaim");
    });

    it("redondeo al cancelar: reclamado + devuelto = depositado, sin retirar de más", async function () {
      const ctx = await loadFixture(deployFixture);
      const { payer, beneficiary, token, vesting } = ctx;
      const { amount, startTime } = await createAgreement(ctx, {
        amount: 100n,
        duration: 3n,
      });

      await time.setNextBlockTimestamp(startTime + 1n);
      const payerBefore = await token.balanceOf(payer.address);
      await vesting.cancel(0);

      const refund = (await token.balanceOf(payer.address)) - payerBefore;
      expect(refund).to.equal(67n);
      expect(await vesting.vestedAmount(0)).to.equal(33n);

      await vesting.connect(beneficiary).claim(0);
      const claimed = await token.balanceOf(beneficiary.address);
      expect(claimed).to.equal(33n);

      expect(claimed + refund).to.equal(amount);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
    });

    it("solo el pagador puede cancelar", async function () {
      const ctx = await loadFixture(deployFixture);
      const { beneficiary, stranger, vesting } = ctx;
      const { duration, startTime } = await createAgreement(ctx);

      await time.setNextBlockTimestamp(startTime + duration / 2n);

      await expect(
        vesting.connect(beneficiary).cancel(0),
      ).to.be.revertedWithCustomError(vesting, "Unauthorized");

      await expect(
        vesting.connect(stranger).cancel(0),
      ).to.be.revertedWithCustomError(vesting, "Unauthorized");

      expect((await vesting.getAgreement(0)).status).to.equal(0n);
    });

    it("no se puede cancelar un acuerdo no revocable", async function () {
      const ctx = await loadFixture(deployFixture);
      const { token, vesting } = ctx;
      const { amount, duration, startTime } = await createAgreement(ctx, {
        revocable: false,
      });

      await time.setNextBlockTimestamp(startTime + duration / 2n);

      await expect(vesting.cancel(0)).to.be.revertedWithCustomError(
        vesting,
        "NotRevocable",
      );

      expect((await vesting.getAgreement(0)).status).to.equal(0n);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(
        amount,
      );
    });

    it("no se puede cancelar dos veces", async function () {
      const ctx = await loadFixture(deployFixture);
      const { vesting } = ctx;
      const { duration, startTime } = await createAgreement(ctx);

      await time.setNextBlockTimestamp(startTime + duration / 2n);
      await vesting.cancel(0);

      await expect(vesting.cancel(0)).to.be.revertedWithCustomError(
        vesting,
        "AgreementNotActive",
      );
    });

    it("no se puede cancelar cuando el período ya terminó", async function () {
      const ctx = await loadFixture(deployFixture);
      const { vesting } = ctx;
      const { amount, endTime } = await createAgreement(ctx);

      await time.setNextBlockTimestamp(endTime);

      await expect(vesting.cancel(0)).to.be.revertedWithCustomError(
        vesting,
        "VestingAlreadyEnded",
      );

      await time.increaseTo(endTime + 1n);
      expect(await vesting.claimableAmount(0)).to.equal(amount);
    });

    it("no se puede cancelar un acuerdo inexistente", async function () {
      const { vesting } = await loadFixture(deployFixture);

      await expect(vesting.cancel(99)).to.be.revertedWithCustomError(
        vesting,
        "AgreementNotFound",
      );
    });
  });
});
