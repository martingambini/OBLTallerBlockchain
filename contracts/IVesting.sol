// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVesting {
    enum Status {
        Active,
        Completed,
        Cancelled
    }

    struct Agreement {
        address payer;
        uint48 startTime;
        uint48 endTime;
        address beneficiary;
        uint48 cliffTime;
        bool revocable;
        Status status;
        address token;
        uint128 totalAmount;
        uint128 claimedAmount;
        uint128 vestedAtCancel;
    }

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed payer,
        address indexed beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffTime,
        uint256 endTime,
        bool revocable
    );

    event TokensClaimed(
        uint256 indexed agreementId,
        address indexed beneficiary,
        uint256 amount
    );

    event AgreementCancelled(
        uint256 indexed agreementId,
        address indexed payer,
        uint256 vestedAmount,
        uint256 refundedAmount
    );

    error InvalidBeneficiary();
    error InvalidToken();
    error InvalidAmount();
    error AmountTooLarge();
    error InvalidTimeRange();
    error InvalidCliff();
    error UnsupportedToken();
    error AgreementNotFound();
    error Unauthorized();
    error NothingToClaim();
    error AgreementCompleted();
    error NotRevocable();
    error AgreementNotActive();
    error VestingAlreadyEnded();

    function createAgreement(
        address beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffTime,
        uint256 endTime,
        bool revocable
    ) external returns (uint256 agreementId);

    function claim(uint256 agreementId) external;

    function cancel(uint256 agreementId) external;

    function nextAgreementId() external view returns (uint256);

    function getAgreement(
        uint256 agreementId
    ) external view returns (Agreement memory);

    function vestedAmount(uint256 agreementId) external view returns (uint256);

    function claimableAmount(
        uint256 agreementId
    ) external view returns (uint256);

    function agreementCountByPayer(
        address payer
    ) external view returns (uint256);

    function agreementCountByBeneficiary(
        address beneficiary
    ) external view returns (uint256);

    function getAgreementIdsByPayer(
        address payer,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory);

    function getAgreementIdsByBeneficiary(
        address beneficiary,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory);
}
