// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = value / 100;
        super._update(from, to, value - fee);
        super._update(from, address(0), fee);
    }
}
