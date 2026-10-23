// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title VYNTRA
/// @notice Platform token for Vyntra (Pons/Argus-style buyback sink). Fixed 1B supply.
contract VYNTRA is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor(address recipient) ERC20("Vyntra", "VYNTRA") {
        require(recipient != address(0), "RECIPIENT");
        _mint(recipient, TOTAL_SUPPLY);
    }
}
