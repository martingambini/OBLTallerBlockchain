
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vesting {
    using SafeERC20 for IERC20;

    enum Status {
        Active,
        Completed,
        Cancelled
    }

    struct Agreement {
        address payer;
        address beneficiary;
        IERC20 token;
        uint256 totalAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 claimedAmount;
        bool revocable;
        Status status;
    }

    uint256 public nextAgreementId;

    mapping(uint256 => Agreement) public agreements;
}

