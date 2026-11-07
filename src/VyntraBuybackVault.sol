// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VyntraMarket} from "./VyntraMarket.sol";

/// @title VyntraBuybackVault
/// @notice Holds protocol HYPE and permissionlessly buys VYNTRA to burn (Pons-style).
contract VyntraBuybackVault is ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_RESERVE_BPS_PER_BUYBACK = 50; // 0.5% of current HYPE-side reserves
    uint256 public constant MAX_QUOTE_SLIPPAGE_BPS = 100; // 1% below the pre-trade pool quote
    uint256 public constant MIN_BUYBACK_INTERVAL = 6 hours;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    VyntraMarket public immutable market;
    IERC20 public immutable vyntra;
    uint256 public lastBuybackAt;

    event BuybackExecuted(address indexed caller, uint256 nativeSpent, uint256 vyntraBurned);
    event Received(address indexed from, uint256 amount);

    error BadAmount();
    error BuybackTooSoon();
    error BuybackTooLarge();
    error EmptyQuote();

    constructor(address market_, address vyntra_) {
        require(market_ != address(0) && vyntra_ != address(0), "ZERO");
        market = VyntraMarket(payable(market_));
        vyntra = IERC20(vyntra_);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Spend vault HYPE to buy VYNTRA on VyntraMarket and send to dead address.
    function buyAndBurn(uint256 nativeIn, uint256 minVyntraOut)
        external
        nonReentrant
        returns (uint256 vyntraBurned)
    {
        if (nativeIn == 0 || nativeIn > address(this).balance) revert BadAmount();
        if (lastBuybackAt != 0 && block.timestamp < lastBuybackAt + MIN_BUYBACK_INTERVAL) {
            revert BuybackTooSoon();
        }
        if (nativeIn > maxBuybackAmount()) revert BuybackTooLarge();

        uint256 quoted = market.quoteBuyVyntra(nativeIn);
        if (quoted == 0) revert EmptyQuote();
        uint256 minNumerator = quoted * (BPS - MAX_QUOTE_SLIPPAGE_BPS);
        uint256 safeMinimum = (minNumerator + BPS - 1) / BPS;
        if (minVyntraOut < safeMinimum) minVyntraOut = safeMinimum;

        vyntraBurned = market.buyVyntra{value: nativeIn}(minVyntraOut);
        require(vyntra.transfer(BURN, vyntraBurned), "BURN");
        lastBuybackAt = block.timestamp;
        emit BuybackExecuted(msg.sender, nativeIn, vyntraBurned);
    }

    /// @notice Limit each buyback to 0.5% of current pool HYPE reserves.
    function maxBuybackAmount() public view returns (uint256) {
        return (market.reserveNative() * MAX_RESERVE_BPS_PER_BUYBACK) / BPS;
    }

    function canExecuteBuyback() external view returns (bool) {
        return maxBuybackAmount() > 0
            && (lastBuybackAt == 0 || block.timestamp >= lastBuybackAt + MIN_BUYBACK_INTERVAL);
    }

    function quoteBuyAndBurn(uint256 nativeIn) external view returns (uint256) {
        return market.quoteBuyVyntra(nativeIn);
    }
}
