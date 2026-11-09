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
  const [payer, beneficiary, other] = await ethers.getSigners();
  const token = await ethers.deployContract("MockToken");
  const vesting = await ethers.deployContract("Vesting");
  return { payer, beneficiary, other, token, vesting };
}

type Context = Awaited<ReturnType<typeof deployFixture>>;

async function createWithCliff(
  ctx: Context,
  opts: {
    amount: bigint;
    startOffset: bigint;
    cliffOffset: bigint;
    duration: bigint;
    revocable?: boolean;
  },
) {
  const startTime = (await now()) + opts.startOffset;
  const cliffTime = startTime + opts.cliffOffset;
  const endTime = startTime + opts.duration;

  await ctx.token.approve(await ctx.vesting.getAddress(), opts.amount);
  await ctx.vesting.createAgreement(
    ctx.beneficiary.address,
    await ctx.token.getAddress(),
    opts.amount,
    startTime,
    cliffTime,
    endTime,
    opts.revocable ?? true,
  );

  return { startTime, cliffTime, endTime };
}

describe("Vesting: cliff, listados y validaciones", function () {
  describe("cliff", function () {
    it("guarda todos los campos del acuerdo, incluido el cliff, y emite el evento", async function () {
      const { payer, beneficiary, token, vesting } =
        await loadFixture(deployFixture);
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const cliffTime = startTime + 10n * DAY;
      const endTime = startTime + 100n * DAY;
      const tokenAddress = await token.getAddress();

      await token.approve(await vesting.getAddress(), amount);

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          amount,
          startTime,
          cliffTime,
          endTime,
          false,
        ),
      )
        .to.emit(vesting, "AgreementCreated")
        .withArgs(
          0n,
          payer.address,
          beneficiary.address,
          tokenAddress,
          amount,
          startTime,
          cliffTime,
          endTime,
          false,
        );

      const agreement = await vesting.getAgreement(0);
      expect(agreement.payer).to.equal(payer.address);
      expect(agreement.beneficiary).to.equal(beneficiary.address);
      expect(agreement.token).to.equal(tokenAddress);
      expect(agreement.totalAmount).to.equal(amount);
      expect(agreement.claimedAmount).to.equal(0n);
      expect(agreement.vestedAtCancel).to.equal(0n);
      expect(agreement.startTime).to.equal(startTime);
      expect(agreement.cliffTime).to.equal(cliffTime);
      expect(agreement.endTime).to.equal(endTime);
      expect(agreement.revocable).to.equal(false);
      expect(agreement.status).to.equal(0n);
    });

    it("antes del cliff no se devenga nada; en el cliff se devenga lo lineal desde el inicio", async function () {
      const ctx = await loadFixture(deployFixture);
      const { beneficiary, token, vesting } = ctx;
      const { startTime, cliffTime } = await createWithCliff(ctx, {
        amount: units("1000"),
        startOffset: 100n,
        cliffOffset: 30n * DAY,
        duration: 100n * DAY,
      });

      await time.increaseTo(cliffTime - 2n);
      expect(await vesting.vestedAmount(0)).to.equal(0n);
      expect(await vesting.claimableAmount(0)).to.equal(0n);

      await expect(
        vesting.connect(beneficiary).claim(0),
      ).to.be.revertedWithCustomError(vesting, "NothingToClaim");

      await time.setNextBlockTimestamp(cliffTime);
      await vesting.connect(beneficiary).claim(0);
      expect(await token.balanceOf(beneficiary.address)).to.equal(
        units("300"),
      );

      await time.increaseTo(startTime + 50n * DAY);
      expect(await vesting.vestedAmount(0)).to.equal(units("500"));
      expect(await vesting.claimableAmount(0)).to.equal(units("200"));
    });

    it("con el cliff igual al fin no se devenga nada hasta el final", async function () {
      const ctx = await loadFixture(deployFixture);
      const { vesting } = ctx;
      const amount = units("1000");
      const { endTime } = await createWithCliff(ctx, {
        amount,
        startOffset: 100n,
        cliffOffset: 10n * DAY,
        duration: 10n * DAY,
      });

      await time.increaseTo(endTime - 1n);
      expect(await vesting.vestedAmount(0)).to.equal(0n);

      await time.increaseTo(endTime);
      expect(await vesting.vestedAmount(0)).to.equal(amount);
    });

    it("cancelar antes del cliff devuelve todo al pagador", async function () {
      const ctx = await loadFixture(deployFixture);
      const { payer, token, vesting } = ctx;
      const amount = units("1000");
      const { startTime } = await createWithCliff(ctx, {
        amount,
        startOffset: 100n,
        cliffOffset: 30n * DAY,
        duration: 100n * DAY,
      });

      const payerBefore = await token.balanceOf(payer.address);

      await time.setNextBlockTimestamp(startTime + 10n * DAY);
      await vesting.cancel(0);

      const payerAfter = await token.balanceOf(payer.address);
      expect(payerAfter - payerBefore).to.equal(amount);
      expect(await vesting.vestedAmount(0)).to.equal(0n);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
    });

    it("rechaza un cliff fuera del rango [inicio, fin]", async function () {
      const { beneficiary, token, vesting } = await loadFixture(deployFixture);
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const endTime = startTime + 10n * DAY;
      const tokenAddress = await token.getAddress();

      await token.approve(await vesting.getAddress(), amount);

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          amount,
          startTime,
          startTime - 1n,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidCliff");

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          amount,
          startTime,
          endTime + 1n,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidCliff");

      expect(await vesting.nextAgreementId()).to.equal(0n);
    });
  });

  describe("validaciones del struct empaquetado y del token", function () {
    it("rechaza montos y fechas que no entran en el struct empaquetado", async function () {
      const { beneficiary, token, vesting } = await loadFixture(deployFixture);
      const startTime = (await now()) + 100n;
      const endTime = startTime + DAY;
      const tokenAddress = await token.getAddress();

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          2n ** 128n,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "AmountTooLarge");

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          tokenAddress,
          1n,
          startTime,
          startTime,
          2n ** 48n,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "InvalidTimeRange");
    });

    it("soporta montos cercanos al máximo de uint128 sin desbordar", async function () {
      const ctx = await loadFixture(deployFixture);
      const { payer, token, vesting } = ctx;
      const amount = 2n ** 128n - 1n;

      await token.mint(payer.address, amount);
      const { startTime, endTime } = await createWithCliff(ctx, {
        amount,
        startOffset: 100n,
        cliffOffset: 0n,
        duration: 10n * DAY,
      });

      await time.increaseTo(startTime + 5n * DAY);
      expect(await vesting.vestedAmount(0)).to.equal(
        (amount * (5n * DAY)) / (10n * DAY),
      );

      await time.increaseTo(endTime);
      expect(await vesting.vestedAmount(0)).to.equal(amount);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(
        amount,
      );
    });

    it("rechaza tokens que cobran comisión al transferir", async function () {
      const { payer, beneficiary, vesting } = await loadFixture(deployFixture);
      const feeToken = await ethers.deployContract("FeeOnTransferToken");
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const endTime = startTime + 10n * DAY;

      await feeToken.approve(await vesting.getAddress(), amount);

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          await feeToken.getAddress(),
          amount,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(vesting, "UnsupportedToken");

      expect(await vesting.nextAgreementId()).to.equal(0n);
      expect(await feeToken.balanceOf(await vesting.getAddress())).to.equal(
        0n,
      );
      expect(await vesting.agreementCountByPayer(payer.address)).to.equal(0n);
    });
  });

  describe("consultas", function () {
    it("las consultas por id inexistente revierten con AgreementNotFound", async function () {
      const { beneficiary, vesting } = await loadFixture(deployFixture);

      await expect(vesting.getAgreement(0)).to.be.revertedWithCustomError(
        vesting,
        "AgreementNotFound",
      );
      await expect(vesting.vestedAmount(0)).to.be.revertedWithCustomError(
        vesting,
        "AgreementNotFound",
      );
      await expect(vesting.claimableAmount(0)).to.be.revertedWithCustomError(
        vesting,
        "AgreementNotFound",
      );
      await expect(
        vesting.connect(beneficiary).claim(0),
      ).to.be.revertedWithCustomError(vesting, "AgreementNotFound");
    });

    it("listados por pagador y por beneficiario con paginación", async function () {
      const { payer, beneficiary, other, token, vesting } =
        await loadFixture(deployFixture);
      const amount = units("10");
      const startTime = (await now()) + 100n;
      const endTime = startTime + DAY;
      const tokenAddress = await token.getAddress();

      await token.approve(await vesting.getAddress(), amount * 3n);

      for (const to of [beneficiary.address, other.address, beneficiary.address]) {
        await vesting.createAgreement(
          to,
          tokenAddress,
          amount,
          startTime,
          startTime,
          endTime,
          true,
        );
      }

      const ids = async (
        method: "getAgreementIdsByPayer" | "getAgreementIdsByBeneficiary",
        who: string,
        offset: bigint,
        limit: bigint,
      ) => [...(await vesting[method](who, offset, limit))];

      expect(await vesting.agreementCountByPayer(payer.address)).to.equal(3n);
      expect(
        await vesting.agreementCountByBeneficiary(beneficiary.address),
      ).to.equal(2n);
      expect(await vesting.agreementCountByBeneficiary(other.address)).to.equal(
        1n,
      );
      expect(await vesting.agreementCountByPayer(other.address)).to.equal(0n);

      expect(await ids("getAgreementIdsByPayer", payer.address, 0n, 10n)).to.deep.equal([0n, 1n, 2n]);
      expect(
        await ids("getAgreementIdsByBeneficiary", beneficiary.address, 0n, 10n),
      ).to.deep.equal([0n, 2n]);
      expect(
        await ids("getAgreementIdsByBeneficiary", other.address, 0n, 10n),
      ).to.deep.equal([1n]);

      expect(await ids("getAgreementIdsByPayer", payer.address, 1n, 1n)).to.deep.equal([1n]);
      expect(await ids("getAgreementIdsByPayer", payer.address, 2n, 10n)).to.deep.equal([2n]);
      expect(await ids("getAgreementIdsByPayer", payer.address, 3n, 10n)).to.deep.equal([]);
      expect(await ids("getAgreementIdsByPayer", payer.address, 0n, 0n)).to.deep.equal([]);
      expect(
        await ids("getAgreementIdsByPayer", payer.address, 1n, 2n ** 256n - 1n),
      ).to.deep.equal([1n, 2n]);
      expect(await ids("getAgreementIdsByPayer", other.address, 0n, 10n)).to.deep.equal([]);
    });
  });
});
