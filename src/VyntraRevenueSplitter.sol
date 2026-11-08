// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VyntraToken} from "./VyntraToken.sol";

interface IVyntraCurve {
    function buy(uint256 minTokensOut, address referrer) external payable returns (uint256);
    function injectNativeLiquidity() external payable;
}

/// @title VyntraRevenueSplitter
/// @notice Per-launch optional creator buy/sell tax with a four-way HYPE split.
contract VyntraRevenueSplitter is ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    VyntraToken public immutable token;
    address public immutable creator;
    address public immutable factory;

    address public curve;

    uint256 public immutable buyTaxBps;
    uint256 public immutable sellTaxBps;
    uint256 public immutable fundsBps;
    uint256 public immutable buybackBps;
    uint256 public immutable dividendsBps;
    uint256 public immutable liquidityBps;

    uint256 public fundsAccrued;
    uint256 public buybackAccrued;
    uint256 public dividendsAccrued;
    uint256 public liquidityAccrued;

    event TaxReceived(uint256 amount, uint256 funds, uint256 buyback, uint256 dividends, uint256 liquidity);
    event FundsClaimed(address indexed creator, uint256 amount);
    event MemeBuyback(address indexed caller, uint256 nativeSpent, uint256 tokensBurned);
    event DividendsClaimed(address indexed account, uint256 amount);
    event LiquidityInjected(address indexed caller, uint256 amount);

    error BadConfig();
    error NotCreator();
    error NotFactory();
    error CurveSet();
    error BadAmount();
    error NothingAccrued();
    error SendFailed();

    constructor(
        address token_,
        address creator_,
        uint256 buyTaxBps_,
        uint256 sellTaxBps_,
        uint256 fundsBps_,
        uint256 buybackBps_,
        uint256 dividendsBps_,
        uint256 liquidityBps_
    ) {
        if (token_ == address(0) || creator_ == address(0)) revert BadConfig();
        _validateTaxes(buyTaxBps_, sellTaxBps_, fundsBps_, buybackBps_, dividendsBps_, liquidityBps_);

        token = VyntraToken(token_);
        creator = creator_;
        factory = msg.sender;
        buyTaxBps = buyTaxBps_;
        sellTaxBps = sellTaxBps_;
        fundsBps = fundsBps_;
        buybackBps = buybackBps_;
        dividendsBps = dividendsBps_;
        liquidityBps = liquidityBps_;
    }

    function setCurve(address curve_) external {
        if (msg.sender != factory) revert NotFactory();
        if (curve != address(0)) revert CurveSet();
        if (curve_ == address(0)) revert BadConfig();
        curve = curve_;
    }

    /// @notice Called by the curve with meme tax HYPE; splits into 4 accrual buckets.
    /// @dev Not nonReentrant: may be invoked mid-trade (e.g. buyAndBurnMeme → curve.buy → tax).
    function receiveTax() external payable {
        if (msg.value == 0) revert BadAmount();
        uint256 v = msg.value;
        uint256 f = (v * fundsBps) / BPS;
        uint256 b = (v * buybackBps) / BPS;
        uint256 d = (v * dividendsBps) / BPS;
        uint256 l = v - f - b - d;

        fundsAccrued += f;
        buybackAccrued += b;
        dividendsAccrued += d;
        liquidityAccrued += l;

        emit TaxReceived(v, f, b, d, l);
    }

    function claimFunds() external nonReentrant {
        if (msg.sender != creator) revert NotCreator();
        uint256 amount = fundsAccrued;
        if (amount == 0) revert NothingAccrued();
        fundsAccrued = 0;
        (bool sent,) = payable(creator).call{value: amount}("");
        if (!sent) revert SendFailed();
        emit FundsClaimed(creator, amount);
    }

    /// @notice Spend buybackAccrued HYPE on the curve and burn meme tokens.
    function buyAndBurnMeme(uint256 nativeAmount, uint256 minTokensOut) external nonReentrant {
        if (nativeAmount == 0 || nativeAmount > buybackAccrued) revert BadAmount();
        if (curve == address(0)) revert BadConfig();
        buybackAccrued -= nativeAmount;

        uint256 tokensOut = IVyntraCurve(curve).buy{value: nativeAmount}(minTokensOut, address(0));
        require(token.transfer(BURN, tokensOut), "BURN");
        emit MemeBuyback(msg.sender, nativeAmount, tokensOut);
    }

    function claimDividends() external nonReentrant {
        uint256 bal = token.balanceOf(msg.sender);
        if (bal == 0) revert BadAmount();
        uint256 supply = token.totalSupply();
        if (supply == 0 || dividendsAccrued == 0) revert NothingAccrued();

        uint256 share = (dividendsAccrued * bal) / supply;
        if (share == 0) revert NothingAccrued();
        dividendsAccrued -= share;

        (bool sent,) = payable(msg.sender).call{value: share}("");
        if (!sent) revert SendFailed();
        emit DividendsClaimed(msg.sender, share);
    }

    /// @notice Inject liquidityAccrued HYPE into the curve reserves.
    function injectLiquidity(uint256 nativeAmount) external nonReentrant {
        if (nativeAmount == 0 || nativeAmount > liquidityAccrued) revert BadAmount();
        if (curve == address(0)) revert BadConfig();
        liquidityAccrued -= nativeAmount;
        IVyntraCurve(curve).injectNativeLiquidity{value: nativeAmount}();
        emit LiquidityInjected(msg.sender, nativeAmount);
    }

    function _validateTaxes(
        uint256 buyTaxBps_,
        uint256 sellTaxBps_,
        uint256 fundsBps_,
        uint256 buybackBps_,
        uint256 dividendsBps_,
        uint256 liquidityBps_
    ) internal pure {
        if (!_taxOk(buyTaxBps_) || !_taxOk(sellTaxBps_)) revert BadConfig();
        if (buyTaxBps_ > 0 || sellTaxBps_ > 0) {
            if (fundsBps_ + buybackBps_ + dividendsBps_ + liquidityBps_ != BPS) revert BadConfig();
        }
    }

    function _taxOk(uint256 taxBps) internal pure returns (bool) {
        return taxBps == 0 || (taxBps >= 100 && taxBps <= 1000);
    }
}
