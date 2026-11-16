// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReentrancyAttacker {
    function execute(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);

        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        return ret;
    }
}
