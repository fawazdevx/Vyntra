// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VyntraMarket} from "./VyntraMarket.sol";

/// @title VyntraBuybackVault
/// @notice Holds protocol BOT and permissionlessly buys VYNTRA to burn (Pons-style).
contract VyntraBuybackVault is ReentrancyGuard {
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    VyntraMarket public immutable market;
    IERC20 public immutable vyntra;

    event BuybackExecuted(address indexed caller, uint256 botSpent, uint256 vyntraBurned);
    event Received(address indexed from, uint256 amount);

    error BadAmount();

    constructor(address market_, address vyntra_) {
        require(market_ != address(0) && vyntra_ != address(0), "ZERO");
        market = VyntraMarket(payable(market_));
        vyntra = IERC20(vyntra_);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Spend vault BOT to buy VYNTRA on VyntraMarket and send to dead address.
    function buyAndBurn(uint256 botIn, uint256 minVyntraOut)
        external
        nonReentrant
        returns (uint256 vyntraBurned)
    {
        if (botIn == 0 || botIn > address(this).balance) revert BadAmount();
        vyntraBurned = market.buyVyntra{value: botIn}(minVyntraOut);
        require(vyntra.transfer(BURN, vyntraBurned), "BURN");
        emit BuybackExecuted(msg.sender, botIn, vyntraBurned);
    }

    function quoteBuyAndBurn(uint256 botIn) external view returns (uint256) {
        return market.quoteBuyVyntra(botIn);
    }
}
