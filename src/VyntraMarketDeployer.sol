// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VyntraCurve} from "./VyntraCurve.sol";

/// @title VyntraMarketDeployer
/// @notice Keeps VyntraCurve creation code out of the factory's deployed bytecode.
contract VyntraMarketDeployer {
    address public immutable owner;
    address public factory;

    error NotOwner();
    error NotFactory();
    error BadFactory();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Bind this deployer to the Vyntra factory once during deployment.
    function setFactory(address factory_) external {
        if (msg.sender != owner) revert NotOwner();
        if (factory != address(0) || factory_ == address(0) || factory_.code.length == 0) {
            revert BadFactory();
        }
        factory = factory_;
    }

    function deployMarket(
        address token,
        address creator,
        address protocolTreasury,
        uint256 graduationThreshold,
        uint256 totalSupply,
        address splitter,
        address poolManager,
        address creatorFeeRecipient
    ) external returns (address market) {
        if (msg.sender != factory || factory == address(0)) revert NotFactory();
        market = address(
            new VyntraCurve(
                token,
                creator,
                protocolTreasury,
                factory,
                graduationThreshold,
                totalSupply,
                splitter,
                poolManager,
                creatorFeeRecipient
            )
        );
    }
}
