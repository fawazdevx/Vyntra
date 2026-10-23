// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VyntraMarket
/// @notice Minimal constant-product BOT/VYNTRA pool for protocol buybacks.
contract VyntraMarket is ReentrancyGuard {
    IERC20 public immutable vyntra;
    uint256 public reserveBot;
    uint256 public reserveVyntra;

    event Seeded(uint256 botAmount, uint256 vyntraAmount);
    event BuyVyntra(address indexed buyer, uint256 botIn, uint256 vyntraOut);
    event SellVyntra(address indexed seller, uint256 vyntraIn, uint256 botOut);

    error BadAmount();
    error Slippage();
    error AlreadySeeded();
    error NotSeeded();

    constructor(address vyntra_) {
        require(vyntra_ != address(0), "VYNTRA");
        vyntra = IERC20(vyntra_);
    }

    /// @notice Seed the pool once with VYNTRA (pulled from msg.sender) + BOT (msg.value).
    function seed(uint256 vyntraAmount) external payable nonReentrant {
        if (reserveBot != 0 || reserveVyntra != 0) revert AlreadySeeded();
        if (msg.value == 0 || vyntraAmount == 0) revert BadAmount();
        require(vyntra.transferFrom(msg.sender, address(this), vyntraAmount), "TRANSFER");
        reserveBot = msg.value;
        reserveVyntra = vyntraAmount;
        emit Seeded(msg.value, vyntraAmount);
    }

    function quoteBuyVyntra(uint256 botIn) public view returns (uint256 vyntraOut) {
        if (botIn == 0 || reserveBot == 0 || reserveVyntra == 0) return 0;
        // x*y=k with 0 fee for buybacks (protocol volume)
        vyntraOut = (botIn * reserveVyntra) / (reserveBot + botIn);
    }

    function quoteSellVyntra(uint256 vyntraIn) public view returns (uint256 botOut) {
        if (vyntraIn == 0 || reserveBot == 0 || reserveVyntra == 0) return 0;
        botOut = (vyntraIn * reserveBot) / (reserveVyntra + vyntraIn);
    }

    function buyVyntra(uint256 minVyntraOut) external payable nonReentrant returns (uint256 vyntraOut) {
        if (reserveBot == 0) revert NotSeeded();
        if (msg.value == 0) revert BadAmount();
        vyntraOut = quoteBuyVyntra(msg.value);
        if (vyntraOut < minVyntraOut) revert Slippage();
        if (vyntraOut == 0 || vyntraOut >= reserveVyntra) revert BadAmount();

        reserveBot += msg.value;
        reserveVyntra -= vyntraOut;
        require(vyntra.transfer(msg.sender, vyntraOut), "TRANSFER");
        emit BuyVyntra(msg.sender, msg.value, vyntraOut);
    }

    function sellVyntra(uint256 vyntraIn, uint256 minBotOut) external nonReentrant returns (uint256 botOut) {
        if (reserveVyntra == 0) revert NotSeeded();
        if (vyntraIn == 0) revert BadAmount();
        botOut = quoteSellVyntra(vyntraIn);
        if (botOut < minBotOut) revert Slippage();
        if (botOut == 0 || botOut >= reserveBot) revert BadAmount();

        require(vyntra.transferFrom(msg.sender, address(this), vyntraIn), "TRANSFER");
        reserveVyntra += vyntraIn;
        reserveBot -= botOut;
        (bool sent,) = payable(msg.sender).call{value: botOut}("");
        require(sent, "SEND");
        emit SellVyntra(msg.sender, vyntraIn, botOut);
    }

    receive() external payable {
        revert("USE_BUY");
    }
}
