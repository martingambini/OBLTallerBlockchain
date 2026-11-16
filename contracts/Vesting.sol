// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IVesting.sol";

contract Vesting is IVesting, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public nextAgreementId;

    mapping(uint256 => Agreement) private _agreements;
    mapping(address => uint256[]) private _agreementIdsByPayer;
    mapping(address => uint256[]) private _agreementIdsByBeneficiary;

    function createAgreement(
        address beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffTime,
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

        if (totalAmount > type(uint128).max) {
            revert AmountTooLarge();
        }

        if (endTime <= startTime || endTime > type(uint48).max) {
            revert InvalidTimeRange();
        }

        if (cliffTime < startTime || cliffTime > endTime) {
            revert InvalidCliff();
        }

        agreementId = nextAgreementId;
        nextAgreementId = agreementId + 1;

        _agreements[agreementId] = Agreement({
            payer: msg.sender,
            startTime: uint48(startTime),
            endTime: uint48(endTime),
            beneficiary: beneficiary,
            cliffTime: uint48(cliffTime),
            revocable: revocable,
            status: Status.Active,
            token: token,
            totalAmount: uint128(totalAmount),
            claimedAmount: 0,
            vestedAtCancel: 0
        });

        _agreementIdsByPayer[msg.sender].push(agreementId);
        _agreementIdsByBeneficiary[beneficiary].push(agreementId);

        IERC20 erc20 = IERC20(token);
        uint256 balanceBefore = erc20.balanceOf(address(this));

        erc20.safeTransferFrom(msg.sender, address(this), totalAmount);

        if (erc20.balanceOf(address(this)) - balanceBefore != totalAmount) {
            revert UnsupportedToken();
        }

        emit AgreementCreated(
            agreementId,
            msg.sender,
            beneficiary,
            token,
            totalAmount,
            startTime,
            cliffTime,
            endTime,
            revocable
        );
    }

    function vestedAmount(
        uint256 agreementId
    ) public view returns (uint256) {
        if (agreementId >= nextAgreementId) {
            revert AgreementNotFound();
        }

        Agreement storage agreement = _agreements[agreementId];

        if (agreement.status == Status.Cancelled) {
            return agreement.vestedAtCancel;
        }

        uint256 currentTime = block.timestamp;

        if (currentTime < agreement.cliffTime) {
            return 0;
        }

        if (currentTime >= agreement.endTime) {
            return agreement.totalAmount;
        }

        uint256 elapsedTime = currentTime - agreement.startTime;
        uint256 duration = agreement.endTime - agreement.startTime;

        return (uint256(agreement.totalAmount) * elapsedTime) / duration;
    }

    function claimableAmount(
        uint256 agreementId
    ) public view returns (uint256) {
        return vestedAmount(agreementId)
            - _agreements[agreementId].claimedAmount;
    }

    function claim(uint256 agreementId) external nonReentrant {
        if (agreementId >= nextAgreementId) {
            revert AgreementNotFound();
        }

        Agreement storage agreement = _agreements[agreementId];

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
        agreement.claimedAmount += uint128(amount);

        if (
            agreement.status == Status.Active &&
            block.timestamp >= agreement.endTime &&
            agreement.claimedAmount == agreement.totalAmount
        ) {
            agreement.status = Status.Completed;
        }

        IERC20(agreement.token).safeTransfer(agreement.beneficiary, amount);

        emit TokensClaimed(agreementId, agreement.beneficiary, amount);
    }

    function cancel(uint256 agreementId) external nonReentrant {
        if (agreementId >= nextAgreementId) {
            revert AgreementNotFound();
        }

        Agreement storage agreement = _agreements[agreementId];

        if (msg.sender != agreement.payer) {
            revert Unauthorized();
        }

        if (!agreement.revocable) {
            revert NotRevocable();
        }

        if (agreement.status != Status.Active) {
            revert AgreementNotActive();
        }

        if (block.timestamp >= agreement.endTime) {
            revert VestingAlreadyEnded();
        }

        uint256 vested = vestedAmount(agreementId);

        uint256 refund = agreement.totalAmount - vested;

        agreement.vestedAtCancel = uint128(vested);
        agreement.status = Status.Cancelled;

        IERC20(agreement.token).safeTransfer(agreement.payer, refund);

        emit AgreementCancelled(agreementId, agreement.payer, vested, refund);
    }

    function getAgreement(
        uint256 agreementId
    ) external view returns (Agreement memory) {
        if (agreementId >= nextAgreementId) {
            revert AgreementNotFound();
        }

        return _agreements[agreementId];
    }

    function agreementCountByPayer(
        address payer
    ) external view returns (uint256) {
        return _agreementIdsByPayer[payer].length;
    }

    function agreementCountByBeneficiary(
        address beneficiary
    ) external view returns (uint256) {
        return _agreementIdsByBeneficiary[beneficiary].length;
    }

    function getAgreementIdsByPayer(
        address payer,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        return _page(_agreementIdsByPayer[payer], offset, limit);
    }

    function getAgreementIdsByBeneficiary(
        address beneficiary,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        return _page(_agreementIdsByBeneficiary[beneficiary], offset, limit);
    }

    function _page(
        uint256[] storage ids,
        uint256 offset,
        uint256 limit
    ) private view returns (uint256[] memory page) {
        uint256 total = ids.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 remaining = total - offset;
        uint256 size = limit < remaining ? limit : remaining;

        page = new uint256[](size);

        for (uint256 i = 0; i < size; i++) {
            page[i] = ids[offset + i];
        }
    }
}
