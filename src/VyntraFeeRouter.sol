// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VyntraFeeRouter
/// @notice Protocol fee sink: 80% → buyback vault, 20% → ops treasury (Pons-style).
contract VyntraFeeRouter is ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant BUYBACK_BPS = 8_000; // 80%
    uint256 public constant OPS_BPS = 2_000; // 20%

    address public immutable buybackVault;
    address public immutable opsTreasury;

    event Distributed(uint256 toBuyback, uint256 toOps);
    event Received(address indexed from, uint256 amount);

    error NothingToDistribute();
    error SendFailed();

    constructor(address buybackVault_, address opsTreasury_) {
        require(buybackVault_ != address(0) && opsTreasury_ != address(0), "ZERO");
        buybackVault = buybackVault_;
        opsTreasury = opsTreasury_;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Permissionless split of accrued protocol HYPE: 80% buyback / 20% ops.
    function distribute() external nonReentrant {
        _distribute();
    }

    function _distribute() internal {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NothingToDistribute();

        uint256 toBuyback = (bal * BUYBACK_BPS) / BPS;
        uint256 toOps = bal - toBuyback;

        if (toBuyback > 0) {
            (bool okBuy,) = payable(buybackVault).call{value: toBuyback}("");
            if (!okBuy) revert SendFailed();
        }
        if (toOps > 0) {
            (bool okOps,) = payable(opsTreasury).call{value: toOps}("");
            if (!okOps) revert SendFailed();
        }

        emit Distributed(toBuyback, toOps);
    }
}
