// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal BDEX/Uniswap V2 router+factory+WETH+pair mock for graduation tests.
contract MockWBOT is ERC20 {
    constructor() ERC20("Wrapped BOT", "WBOT") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "WETH_OUT");
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}

contract MockPair is ERC20 {
    address public token0;
    address public token1;

    constructor(address t0, address t1) ERC20("BDEX LP", "BDEX-LP") {
        token0 = t0;
        token1 = t1;
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockBdexFactory {
    mapping(address => mapping(address => address)) public getPair;
    address public lastPair;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "IDENTICAL");
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(getPair[t0][t1] == address(0), "EXISTS");
        pair = address(new MockPair(t0, t1));
        getPair[t0][t1] = pair;
        getPair[t1][t0] = pair;
        lastPair = pair;
    }
}

contract MockBdexRouter {
    MockBdexFactory public immutable uniFactory;
    MockWBOT public immutable wbot;

    constructor() {
        uniFactory = new MockBdexFactory();
        wbot = new MockWBOT();
    }

    function factory() external view returns (address) {
        return address(uniFactory);
    }

    function WETH() external view returns (address) {
        return address(wbot);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256, /*amountTokenMin*/
        uint256, /*amountETHMin*/
        address to,
        uint256 /*deadline*/
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(msg.value > 0 && amountTokenDesired > 0, "ZERO");

        amountToken = amountTokenDesired;
        amountETH = msg.value;

        address pair = uniFactory.getPair(token, address(wbot));
        if (pair == address(0)) {
            pair = uniFactory.createPair(token, address(wbot));
        }

        require(IERC20(token).transferFrom(msg.sender, pair, amountToken), "TOKEN");
        wbot.deposit{value: amountETH}();
        require(wbot.transfer(pair, amountETH), "WBOT");

        liquidity = amountToken < amountETH ? amountToken : amountETH;
        if (liquidity == 0) liquidity = 1;
        MockPair(pair).mintTo(to, liquidity);
    }
}
