// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../IVesting.sol";

contract PackedBaseline {
    uint256 public nextAgreementId;

    mapping(uint256 => IVesting.Agreement) private _agreements;
    mapping(address => uint256[]) private _byPayer;
    mapping(address => uint256[]) private _byBeneficiary;

    function create(
        address beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffTime,
        uint256 endTime,
        bool revocable
    ) external returns (uint256 id) {
        id = nextAgreementId;
        nextAgreementId = id + 1;

        _agreements[id] = IVesting.Agreement({
            payer: msg.sender,
            startTime: uint48(startTime),
            endTime: uint48(endTime),
            beneficiary: beneficiary,
            cliffTime: uint48(cliffTime),
            revocable: revocable,
            status: IVesting.Status.Active,
            token: token,
            totalAmount: uint128(totalAmount),
            claimedAmount: 0,
            vestedAtCancel: 0
        });

        _byPayer[msg.sender].push(id);
        _byBeneficiary[beneficiary].push(id);
    }
}

contract UnpackedBaseline {
    struct UnpackedAgreement {
        uint256 payer;
        uint256 startTime;
        uint256 endTime;
        uint256 beneficiary;
        uint256 cliffTime;
        uint256 revocable;
        uint256 status;
        uint256 token;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 vestedAtCancel;
    }

    uint256 public nextAgreementId;

    mapping(uint256 => UnpackedAgreement) private _agreements;
    mapping(address => uint256[]) private _byPayer;
    mapping(address => uint256[]) private _byBeneficiary;

    function create(
        address beneficiary,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffTime,
        uint256 endTime,
        bool revocable
    ) external returns (uint256 id) {
        id = nextAgreementId;
        nextAgreementId = id + 1;

        _agreements[id] = UnpackedAgreement({
            payer: uint256(uint160(msg.sender)),
            startTime: startTime,
            endTime: endTime,
            beneficiary: uint256(uint160(beneficiary)),
            cliffTime: cliffTime,
            revocable: revocable ? 1 : 0,
            status: 0,
            token: uint256(uint160(token)),
            totalAmount: totalAmount,
            claimedAmount: 0,
            vestedAtCancel: 0
        });

        _byPayer[msg.sender].push(id);
        _byBeneficiary[beneficiary].push(id);
    }
}
