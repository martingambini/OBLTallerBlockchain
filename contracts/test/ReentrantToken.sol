// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ReentrantToken is ERC20 {
    address public hookTarget;
    bytes public hookData;
    bool private _inHook;

    constructor() ERC20("Reentrant Token", "RNT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (hookTarget != address(0) && !_inHook && from != address(0)) {
            _inHook = true;
            (bool ok, bytes memory ret) = hookTarget.call(hookData);
            _inHook = false;

            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
