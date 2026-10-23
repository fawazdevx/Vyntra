// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title VyntraToken
/// @notice Fixed-supply ERC20 for Vyntra launches. Entire supply minted once at deploy.
contract VyntraToken is ERC20 {
    address public curve;
    address public immutable factory;
    string public imageURI;
    string public description;

    error OnlyFactory();
    error CurveSet();
    error ZeroAddress();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory imageURI_,
        string memory description_,
        address factory_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        imageURI = imageURI_;
        description = description_;
        _mint(factory_, totalSupply_);
    }

    function setCurve(address curve_) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (curve != address(0)) revert CurveSet();
        if (curve_ == address(0)) revert ZeroAddress();
        curve = curve_;
    }
}
