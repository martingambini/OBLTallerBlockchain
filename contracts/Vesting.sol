
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vesting is ReentrancyGuard {
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

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed payer,
        address indexed beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        bool revocable
    );

    error InvalidBeneficiary();
    error InvalidToken();
    error InvalidAmount();
    error InvalidTimeRange();

    function createAgreement(
        address beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        bool revocable
    ) external nonReentrant returns (uint256 agreementId) {

        if (beneficiary == address(0)) {
            revert InvalidBeneficiary();
        }

        if (token == address(0)) {
            revert InvalidToken();
        }

        if (totalAmount == 0) {
            revert InvalidAmount();
        }

        if (endTime <= startTime) {
            revert InvalidTimeRange();
        }

        agreementId = nextAgreementId;
        nextAgreementId++;

        agreements[agreementId] = Agreement({
            payer: msg.sender,
            beneficiary: beneficiary,
            token: IERC20(token),
            totalAmount: totalAmount,
            startTime: startTime,
            endTime: endTime,
            claimedAmount: 0,
            revocable: revocable,
            status: Status.Active
        });

        IERC20(token).safeTransferFrom(
            msg.sender,
            address(this),
            totalAmount
        );

        emit AgreementCreated(
            agreementId,
            msg.sender,
            beneficiary,
            token,
            totalAmount,
            startTime,
            endTime,
            revocable
        );
    }

    function vestedAmount(
        uint256 agreementId
    ) public view returns (uint256) {
        require(
            agreementId < nextAgreementId,
            "Agreement does not exist"
        );

        Agreement storage agreement = agreements[agreementId];

        uint256 currentTime = block.timestamp;

        if (currentTime <= agreement.startTime) {
            return 0;
        }

        if (currentTime >= agreement.endTime) {
            return agreement.totalAmount;
        }

        uint256 elapsedTime =
            currentTime - agreement.startTime;

        uint256 duration =
            agreement.endTime - agreement.startTime;

        return (
            agreement.totalAmount * elapsedTime
        ) / duration;
    }

    function claimableAmount(
        uint256 agreementId
    ) public view returns (uint256) {
        Agreement storage agreement = agreements[agreementId];

        return vestedAmount(agreementId)
            - agreement.claimedAmount;
    }


    event TokensClaimed(
        uint256 indexed agreementId,
        address indexed beneficiary,
        uint256 amount
    );

    error AgreementNotFound();
    error Unauthorized();
    error NothingToClaim();
    error AgreementCompleted();

    function claim(uint256 agreementId) external nonReentrant {
        if (agreementId >= nextAgreementId) {
            revert AgreementNotFound();
        }

        Agreement storage agreement = agreements[agreementId];


        if (msg.sender != agreement.beneficiary) {
            revert Unauthorized();
        }


        if (agreement.status == Status.Completed) {
            revert AgreementCompleted();
        }

        uint256 amount = claimableAmount(agreementId);

        if (amount == 0) {
            revert NothingToClaim();
        }

        // Actualizar el estado ANTES de transferir
        agreement.claimedAmount += amount;


        if (
            agreement.status == Status.Active &&
            block.timestamp >= agreement.endTime &&
            agreement.claimedAmount == agreement.totalAmount
        ) {
            agreement.status = Status.Completed;
        }


        agreement.token.safeTransfer(
            agreement.beneficiary,
            amount
        );

        emit TokensClaimed(
            agreementId,
            agreement.beneficiary,
            amount
        );
    }

}
