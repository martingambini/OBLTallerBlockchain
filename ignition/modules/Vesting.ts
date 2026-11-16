import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VestingModule", (m) => {
  const token = m.contract("MockToken");
  const vesting = m.contract("Vesting");

  return { token, vesting };
});
