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

async function reentrancyFixture() {
  const [owner] = await ethers.getSigners();
  const vesting = await ethers.deployContract("Vesting");
  const token = await ethers.deployContract("ReentrantToken");
  const attacker = await ethers.deployContract("ReentrancyAttacker");
  await token.mint(await attacker.getAddress(), units("1000000"));
  return { owner, vesting, token, attacker };
}

type Context = Awaited<ReturnType<typeof deployFixture>>;
type AttackContext = Awaited<ReturnType<typeof reentrancyFixture>>;

async function create(
  ctx: Context,
  opts: {
    amount: bigint;
    startOffset: bigint;
    duration: bigint;
    revocable?: boolean;
  },
) {
  const startTime = (await now()) + opts.startOffset;
  const endTime = startTime + opts.duration;

  await ctx.token.approve(await ctx.vesting.getAddress(), opts.amount);
  await ctx.vesting.createAgreement(
    ctx.beneficiary.address,
    await ctx.token.getAddress(),
    opts.amount,
    startTime,
    startTime,
    endTime,
    opts.revocable ?? true,
  );

  return { startTime, endTime };
}

async function attackerCreate(ctx: AttackContext, amount: bigint) {
  const { vesting, token, attacker } = ctx;
  const vestingAddress = await vesting.getAddress();
  const tokenAddress = await token.getAddress();
  const attackerAddress = await attacker.getAddress();
  const startTime = (await now()) + 100n;
  const endTime = startTime + 10n * DAY;

  await attacker.execute(
    tokenAddress,
    token.interface.encodeFunctionData("approve", [vestingAddress, amount * 10n]),
  );
  await attacker.execute(
    vestingAddress,
    vesting.interface.encodeFunctionData("createAgreement", [
      attackerAddress,
      tokenAddress,
      amount,
      startTime,
      startTime,
      endTime,
      true,
    ]),
  );

  return { startTime, endTime };
}

async function armHook(
  ctx: AttackContext,
  method: "claim" | "cancel",
  id: bigint,
) {
  const { vesting, token, attacker } = ctx;
  const inner = vesting.interface.encodeFunctionData(method, [id]);
  const outer = attacker.interface.encodeFunctionData("execute", [
    await vesting.getAddress(),
    inner,
  ]);
  await token.setHook(await attacker.getAddress(), outer);
}

describe("Vesting: seguridad", function () {
  describe("reentrancy con un token malicioso", function () {
    const cases: Array<["claim" | "cancel", "claim" | "cancel"]> = [
      ["claim", "claim"],
      ["claim", "cancel"],
      ["cancel", "claim"],
      ["cancel", "cancel"],
    ];

    for (const [outerCall, innerCall] of cases) {
      it(`${outerCall} no se puede reentrar con ${innerCall} durante la transferencia`, async function () {
        const ctx = await loadFixture(reentrancyFixture);
        const { vesting, attacker } = ctx;
        const { startTime } = await attackerCreate(ctx, units("1000"));

        await time.increaseTo(startTime + 2n * DAY);
        await armHook(ctx, innerCall, 0n);

        await expect(
          attacker.execute(
            await vesting.getAddress(),
            vesting.interface.encodeFunctionData(outerCall, [0n]),
          ),
        ).to.be.revertedWithCustomError(vesting, "ReentrancyGuardReentrantCall");

        const agreement = await vesting.getAgreement(0);
        expect(agreement.claimedAmount).to.equal(0n);
        expect(agreement.status).to.equal(0n);
        expect(
          await ctx.token.balanceOf(await vesting.getAddress()),
        ).to.equal(units("1000"));
      });
    }

    it("createAgreement no se puede reentrar durante transferFrom", async function () {
      const ctx = await loadFixture(reentrancyFixture);
      const { vesting, token, attacker } = ctx;
      const vestingAddress = await vesting.getAddress();
      const tokenAddress = await token.getAddress();
      const attackerAddress = await attacker.getAddress();
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const endTime = startTime + 10n * DAY;

      const createData = vesting.interface.encodeFunctionData(
        "createAgreement",
        [
          attackerAddress,
          tokenAddress,
          amount,
          startTime,
          startTime,
          endTime,
          true,
        ],
      );

      await attacker.execute(
        tokenAddress,
        token.interface.encodeFunctionData("approve", [
          vestingAddress,
          amount * 10n,
        ]),
      );
      await token.setHook(
        attackerAddress,
        attacker.interface.encodeFunctionData("execute", [
          vestingAddress,
          createData,
        ]),
      );

      await expect(
        attacker.execute(vestingAddress, createData),
      ).to.be.revertedWithCustomError(vesting, "ReentrancyGuardReentrantCall");

      expect(await vesting.nextAgreementId()).to.equal(0n);
      expect(await token.balanceOf(vestingAddress)).to.equal(0n);
    });

    it("sin el hook activo el mismo flujo funciona con normalidad", async function () {
      const ctx = await loadFixture(reentrancyFixture);
      const { vesting, token, attacker } = ctx;
      const { startTime } = await attackerCreate(ctx, units("1000"));

      await time.increaseTo(startTime + 5n * DAY);
      await attacker.execute(
        await vesting.getAddress(),
        vesting.interface.encodeFunctionData("claim", [0n]),
      );

      expect(
        (await vesting.getAgreement(0)).claimedAmount,
      ).to.be.greaterThan(0n);
      expect(await token.balanceOf(await attacker.getAddress())).to.be.greaterThan(
        units("999000"),
      );
    });
  });

  describe("tokens y transferencias", function () {
    it("SafeERC20 soporta tokens que no devuelven bool (estilo USDT)", async function () {
      const { payer, beneficiary, vesting } = await loadFixture(deployFixture);
      const token = await ethers.deployContract("NoReturnToken");
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const endTime = startTime + 10n * DAY;

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
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(
        amount,
      );

      await time.increaseTo(endTime);
      await vesting.connect(beneficiary).claim(0);

      expect(await token.balanceOf(beneficiary.address)).to.equal(amount);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
      expect(await token.balanceOf(payer.address)).to.equal(
        units("1000000") - amount,
      );
    });

    it("crear sin allowance suficiente revierte y no deja rastro", async function () {
      const { beneficiary, token, vesting } = await loadFixture(deployFixture);
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const endTime = startTime + DAY;

      await token.approve(await vesting.getAddress(), amount - 1n);

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          await token.getAddress(),
          amount,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");

      expect(await vesting.nextAgreementId()).to.equal(0n);
      expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
    });

    it("crear sin saldo suficiente revierte", async function () {
      const { other, beneficiary, token, vesting } =
        await loadFixture(deployFixture);
      const amount = units("1000");
      const startTime = (await now()) + 100n;
      const endTime = startTime + DAY;

      await token.connect(other).approve(await vesting.getAddress(), amount);

      await expect(
        vesting
          .connect(other)
          .createAgreement(
            beneficiary.address,
            await token.getAddress(),
            amount,
            startTime,
            startTime,
            endTime,
            true,
          ),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("una dirección que no es un token revierte al crear", async function () {
      const { beneficiary, other, vesting } = await loadFixture(deployFixture);
      const startTime = (await now()) + 100n;
      const endTime = startTime + DAY;

      await expect(
        vesting.createAgreement(
          beneficiary.address,
          other.address,
          1n,
          startTime,
          startTime,
          endTime,
          true,
        ),
      ).to.be.revert(ethers);
    });
  });
});
