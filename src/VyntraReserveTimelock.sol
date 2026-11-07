// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Enforces the public delay for reserve-vault operations. A treasury multisig proposes;
/// anyone can execute queued operations after the delay has elapsed.
contract VyntraReserveTimelock is TimelockController {
    uint256 public constant RESERVE_DELAY = 30 days;

    error DelayBelowFloor();

    constructor(address treasurySafe)
        TimelockController(RESERVE_DELAY, _proposers(treasurySafe), _openExecutors(), address(0))
    {}

    /// @notice Allow a longer public delay, but never allow governance to reduce it below thirty days.
    function updateDelay(uint256 newDelay) public override {
        if (newDelay < RESERVE_DELAY) revert DelayBelowFloor();
        super.updateDelay(newDelay);
    }

    function _proposers(address treasurySafe) private pure returns (address[] memory accounts) {
        require(treasurySafe != address(0), "ZERO_TREASURY_SAFE");
        accounts = new address[](1);
        accounts[0] = treasurySafe;
    }

    function _openExecutors() private pure returns (address[] memory accounts) {
        accounts = new address[](1);
        accounts[0] = address(0);
    }
}
