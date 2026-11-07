// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BondingCurveMath} from "./BondingCurveMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapMath} from "@uniswap/v4-core/src/libraries/SwapMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @title VyntraMarket
/// @notice Buyer-funded VYNTRA curve that graduates into a permanently locked no-hook V4 pool.
/// @dev The deployment allocates 50M VYNTRA to this market, but requires no HYPE seed. Buyers
///      collectively fund the configured graduation reserve. The 950M policy reserve is separate.
contract VyntraMarket is ReentrancyGuard, IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint24 public constant POOL_FEE = 10_000;
    int24 public constant TICK_SPACING = 200;
    uint256 public constant ANTI_SNIPE_BLOCKS = 3;
    uint256 public constant MAX_BUY_BPS_ANTI_SNIPE = 200;
    uint256 public constant FEE_BPS = 100;
    uint256 private constant BPS = 10_000;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    uint8 private constant OP_ADD_LIQUIDITY = 1;
    uint8 private constant OP_BUY = 2;
    uint8 private constant OP_SELL = 3;
    uint8 private constant OP_COLLECT_FEES = 4;

    IERC20 public immutable vyntra;
    IPoolManager public immutable poolManager;
    address public immutable owner;
    uint256 public immutable graduationThreshold;

    address public feeRecipient;
    bool public initialized;
    bool public graduated;
    bool private _unlockActive;
    uint8 private _expectedOperation;
    uint160 public initialSqrtPriceX96;
    uint128 public initialLiquidity;
    PoolId public poolId;
    uint256 public seedBlock;
    uint256 public launchBlock;
    uint256 public seededVyntra;
    uint256 public curveTokenSupply;
    uint256 public poolTokenAllocation;
    uint256 public tokensSold;
    uint256 public earlyTokensBought;
    uint256 public realNativeReserves;
    uint256 public protocolFees;

    event CurveOpened(uint256 vyntraAllocation, uint256 curveTokenSupply, uint256 poolTokenAllocation, uint256 graduationThreshold);
    event Seeded(uint256 nativeAmount, uint256 vyntraAmount); // retained as the pool-graduation event
    event Graduated(uint256 nativeAmount, uint256 vyntraAmount);
    event BuyVyntra(address indexed buyer, uint256 nativeIn, uint256 vyntraOut);
    event SellVyntra(address indexed seller, uint256 vyntraIn, uint256 nativeOut);
    event PoolFeesCollected(uint256 nativeFees, uint256 vyntraBurned);
    event FeeRecipientConfigured(address indexed recipient);

    error BadAmount();
    error Slippage();
    error AlreadySeeded();
    error NotSeeded();
    error NotOwner();
    error BadConfig();
    error BadPoolDelta();
    error OnlyPoolManager();
    error BadCallback();
    error BadLiquidity();
    error SendFailed();
    error BadCurveAmount();

    constructor(address vyntra_, address poolManager_, uint256 graduationThreshold_) {
        if (
            vyntra_ == address(0) || poolManager_ == address(0) || vyntra_.code.length == 0
                || poolManager_.code.length == 0 || graduationThreshold_ == 0
                || graduationThreshold_ > 1e36
        ) revert BadConfig();
        vyntra = IERC20(vyntra_);
        poolManager = IPoolManager(poolManager_);
        owner = msg.sender;
        graduationThreshold = graduationThreshold_;
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
    }

    function setFeeRecipient(address recipient) external {
        if (msg.sender != owner) revert NotOwner();
        if (initialized || feeRecipient != address(0) || recipient == address(0) || recipient.code.length == 0) {
            revert BadConfig();
        }
        feeRecipient = recipient;
        emit FeeRecipientConfigured(recipient);
    }

    /// @notice Open the VYNTRA curve using its fixed token allocation and no HYPE contribution.
    function initializeCurve(uint256 vyntraAmount) external {
        if (msg.sender != owner) revert NotOwner();
        if (initialized) revert AlreadySeeded();
        if (feeRecipient == address(0) || vyntraAmount == 0) revert BadConfig();
        (uint256 curveTokens, uint256 poolTokens) = BondingCurveMath.allocations(vyntraAmount);
        (uint256 startPrice, uint256 endPrice) =
            BondingCurveMath.startAndEndPriceWad(graduationThreshold, curveTokens, poolTokens);
        if (startPrice == 0 || endPrice <= startPrice) revert BadConfig();
        if (!vyntra.transferFrom(msg.sender, address(this), vyntraAmount)) revert BadAmount();

        initialized = true;
        seededVyntra = vyntraAmount;
        curveTokenSupply = curveTokens;
        poolTokenAllocation = poolTokens;
        launchBlock = block.number;
        seedBlock = block.number;
        emit CurveOpened(vyntraAmount, curveTokens, poolTokens, graduationThreshold);
    }

    function reserveNative() external view returns (uint256 nativeAmount) {
        (nativeAmount,) = getReserves();
    }

    function reserveVyntra() external view returns (uint256 tokenAmount) {
        (, tokenAmount) = getReserves();
    }

    function getReserves() public view returns (uint256 nativeAmount, uint256 tokenAmount) {
        if (!initialized) return (0, 0);
        if (!graduated) return (realNativeReserves, vyntra.balanceOf(address(this)));
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        nativeAmount = SqrtPriceMath.getAmount0Delta(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickUpper), liquidity, false
        );
        tokenAmount = SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtPriceAtTick(tickLower), sqrtPriceX96, liquidity, false
        );
    }

    function spotPriceWad() external view returns (uint256) {
        if (!initialized) return 0;
        if (!graduated) {
            return BondingCurveMath.spotPriceWad(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold
            );
        }
        (uint256 nativeAmount, uint256 tokenAmount) = getReserves();
        if (tokenAmount == 0) return 0;
        return FullMath.mulDiv(nativeAmount, 1e18, tokenAmount);
    }

    function getProgressBps() external view returns (uint256) {
        if (graduated) return BPS;
        if (graduationThreshold == 0) return 0;
        uint256 progress = FullMath.mulDiv(realNativeReserves, BPS, graduationThreshold);
        return progress > BPS ? BPS : progress;
    }

    function quoteBuyVyntra(uint256 nativeIn) public view returns (uint256 vyntraOut) {
        if (!initialized || nativeIn == 0) return 0;
        if (graduated) return _quotePoolBuy(nativeIn);
        uint256 netAvailable = nativeIn - FullMath.mulDiv(nativeIn, FEE_BPS, BPS);
        uint256 remainingQuote = graduationThreshold > realNativeReserves
            ? graduationThreshold - realNativeReserves
            : 0;
        if (netAvailable >= remainingQuote) return curveTokenSupply - tokensSold;
        vyntraOut = BondingCurveMath.tokensForQuote(
            graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, netAvailable
        );
    }

    function quoteSellVyntra(uint256 vyntraIn) public view returns (uint256 nativeOut) {
        if (!initialized || vyntraIn == 0) return 0;
        if (graduated) return _quotePoolSell(vyntraIn);
        if (vyntraIn > tokensSold) return 0;
        uint256 newSold = tokensSold - vyntraIn;
        uint256 grossOut = BondingCurveMath.quoteForTokens(
            graduationThreshold, curveTokenSupply, poolTokenAllocation, newSold, vyntraIn
        );
        if (grossOut > realNativeReserves) grossOut = realNativeReserves;
        nativeOut = grossOut - FullMath.mulDiv(grossOut, FEE_BPS, BPS);
    }

    function buyVyntra(uint256 minVyntraOut) external payable nonReentrant returns (uint256 vyntraOut) {
        if (!initialized) revert NotSeeded();
        if (msg.value == 0) revert BadAmount();

        uint256 nativeUsed;
        uint256 valueUsed;
        if (!graduated) {
            uint256 grossFeeMax = FullMath.mulDiv(msg.value, FEE_BPS, BPS);
            uint256 netAvailable = msg.value - grossFeeMax;
            uint256 remainingQuote = graduationThreshold - realNativeReserves;
            if (netAvailable >= remainingQuote) {
                vyntraOut = curveTokenSupply - tokensSold;
                nativeUsed = remainingQuote;
            } else {
                vyntraOut = BondingCurveMath.tokensForQuote(
                    graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, netAvailable
                );
                if (vyntraOut == 0) revert BadAmount();
                nativeUsed = BondingCurveMath.quoteForTokens(
                    graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, vyntraOut
                );
            }
            uint256 fee = _feeForNet(nativeUsed);
            valueUsed = nativeUsed + fee;
            while (valueUsed > msg.value && vyntraOut > 0) {
                unchecked { --vyntraOut; }
                if (vyntraOut == 0) revert BadAmount();
                nativeUsed = BondingCurveMath.quoteForTokens(
                    graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, vyntraOut
                );
                fee = _feeForNet(nativeUsed);
                valueUsed = nativeUsed + fee;
            }
            if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
                uint256 earlyBuyCap = FullMath.mulDiv(seededVyntra, MAX_BUY_BPS_ANTI_SNIPE, BPS);
                if (earlyTokensBought + vyntraOut > earlyBuyCap) revert BadAmount();
                earlyTokensBought += vyntraOut;
            }

            realNativeReserves += nativeUsed;
            tokensSold += vyntraOut;
            protocolFees += valueUsed - nativeUsed;
            if (!vyntra.transfer(msg.sender, vyntraOut)) revert BadPoolDelta();
            emit BuyVyntra(msg.sender, valueUsed, vyntraOut);
            if (tokensSold >= curveTokenSupply) _graduate();
        } else {
            bytes memory result = _unlock(abi.encode(OP_BUY, msg.sender, msg.value, minVyntraOut));
            (vyntraOut, nativeUsed) = abi.decode(result, (uint256, uint256));
            if (vyntraOut < minVyntraOut || nativeUsed == 0 || vyntraOut == 0) revert BadAmount();
            if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
                uint256 earlyBuyCap = FullMath.mulDiv(seededVyntra, MAX_BUY_BPS_ANTI_SNIPE, BPS);
                if (earlyTokensBought + vyntraOut > earlyBuyCap) revert BadAmount();
                earlyTokensBought += vyntraOut;
            }
            realNativeReserves += nativeUsed;
            valueUsed = nativeUsed;
            emit BuyVyntra(msg.sender, nativeUsed, vyntraOut);
        }

        if (vyntraOut < minVyntraOut) revert Slippage();
        uint256 refund = msg.value - valueUsed;
        if (refund > 0) {
            (bool sent,) = payable(msg.sender).call{value: refund}("");
            if (!sent) revert SendFailed();
        }
    }

    function sellVyntra(uint256 vyntraIn, uint256 minNativeOut)
        external
        nonReentrant
        returns (uint256 nativeOut)
    {
        if (!initialized) revert NotSeeded();
        if (vyntraIn == 0 || !vyntra.transferFrom(msg.sender, address(this), vyntraIn)) revert BadAmount();

        uint256 tokenUsed;
        if (!graduated) {
            if (vyntraIn > tokensSold) revert BadCurveAmount();
            tokenUsed = vyntraIn;
            uint256 newSold = tokensSold - tokenUsed;
            uint256 grossOut = BondingCurveMath.quoteForTokens(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, newSold, tokenUsed
            );
            if (grossOut > realNativeReserves) grossOut = realNativeReserves;
            uint256 fee = FullMath.mulDiv(grossOut, FEE_BPS, BPS);
            nativeOut = grossOut - fee;
            if (nativeOut < minNativeOut || nativeOut == 0) revert Slippage();
            tokensSold = newSold;
            realNativeReserves -= grossOut;
            protocolFees += fee;
            emit SellVyntra(msg.sender, tokenUsed, nativeOut);
        } else {
            bytes memory result = _unlock(abi.encode(OP_SELL, msg.sender, vyntraIn, minNativeOut));
            (nativeOut, tokenUsed) = abi.decode(result, (uint256, uint256));
            if (nativeOut < minNativeOut || nativeOut == 0 || tokenUsed == 0) revert Slippage();
            uint256 tokenRefund = vyntraIn - tokenUsed;
            if (tokenRefund > 0 && !vyntra.transfer(msg.sender, tokenRefund)) revert BadPoolDelta();
            realNativeReserves = nativeOut >= realNativeReserves ? 0 : realNativeReserves - nativeOut;
            emit SellVyntra(msg.sender, tokenUsed, nativeOut);
        }

        (bool sent,) = payable(msg.sender).call{value: nativeOut}("");
        if (!sent) revert SendFailed();
    }

    /// @notice Permissionlessly route curve fees and locked-position fees to the protocol router.
    function claimProtocolFees() external nonReentrant {
        if (!initialized) revert NotSeeded();
        if (feeRecipient == address(0)) revert BadConfig();
        if (graduated) {
            bytes memory result = _unlock(abi.encode(OP_COLLECT_FEES));
            (uint256 nativeFees, uint256 tokenFees) = abi.decode(result, (uint256, uint256));
            protocolFees += nativeFees;
            if (tokenFees > 0 && !vyntra.transfer(BURN, tokenFees)) revert BadPoolDelta();
            emit PoolFeesCollected(nativeFees, tokenFees);
        }
        uint256 amount = protocolFees;
        if (amount == 0) return;
        protocolFees = 0;
        (bool sent,) = payable(feeRecipient).call{value: amount}("");
        if (!sent) revert SendFailed();
    }

    function poolKey() external view returns (PoolKey memory) { return _poolKey(); }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        uint8 operation = abi.decode(data, (uint8));
        if (!_unlockActive || operation != _expectedOperation) revert BadCallback();
        PoolKey memory key = _poolKey();
        if (operation == OP_ADD_LIQUIDITY) {
            (, uint256 nativeSeed, uint256 tokenSeed) = abi.decode(data, (uint8, uint256, uint256));
            return _addLiquidity(key, nativeSeed, tokenSeed);
        }
        if (operation == OP_BUY) {
            (, address buyer, uint256 nativeIn, uint256 minOut) = abi.decode(data, (uint8, address, uint256, uint256));
            return _swapBuy(key, buyer, nativeIn, minOut);
        }
        if (operation == OP_SELL) {
            (, address seller, uint256 tokenIn, uint256 minOut) = abi.decode(data, (uint8, address, uint256, uint256));
            return _swapSell(key, seller, tokenIn, minOut);
        }
        if (operation == OP_COLLECT_FEES) return _collectPositionFees(key);
        revert BadCallback();
    }

    function _feeForNet(uint256 netAmount) private pure returns (uint256) {
        if (netAmount == 0) return 0;
        uint256 gross = FullMath.mulDivRoundingUp(netAmount, BPS, BPS - FEE_BPS);
        while (gross - FullMath.mulDiv(gross, FEE_BPS, BPS) < netAmount) ++gross;
        while (gross > 1 && gross - 1 - FullMath.mulDiv(gross - 1, FEE_BPS, BPS) >= netAmount) --gross;
        return gross - netAmount;
    }

    function _graduate() private {
        if (graduated || tokensSold < curveTokenSupply || realNativeReserves < graduationThreshold) revert BadCurveAmount();
        graduated = true;
        initialSqrtPriceX96 = _sqrtPriceForSeed(poolTokenAllocation, realNativeReserves);
        PoolKey memory key = _poolKey();
        poolId = key.toId();
        poolManager.initialize(key, initialSqrtPriceX96);
        bytes memory result = _unlock(abi.encode(OP_ADD_LIQUIDITY, realNativeReserves, poolTokenAllocation));
        (uint256 nativeUsed, uint256 tokenUsed, uint128 liquidity) = abi.decode(result, (uint256, uint256, uint128));
        initialLiquidity = liquidity;
        realNativeReserves = nativeUsed;

        uint256 dust = vyntra.balanceOf(address(this));
        if (dust > 0 && !vyntra.transfer(BURN, dust)) revert BadPoolDelta();
        uint256 balance = address(this).balance;
        if (balance > protocolFees) protocolFees += balance - protocolFees;
        emit Seeded(nativeUsed, tokenUsed);
        emit Graduated(nativeUsed, tokenUsed);
    }

    function _quotePoolBuy(uint256 nativeIn) private view returns (uint256 vyntraOut) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return 0;
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        (, , vyntraOut,) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(nativeIn), POOL_FEE
        );
        if (block.number < seedBlock + ANTI_SNIPE_BLOCKS) {
            uint256 earlyBuyCap = FullMath.mulDiv(seededVyntra, MAX_BUY_BPS_ANTI_SNIPE, BPS);
            if (earlyTokensBought >= earlyBuyCap || vyntraOut > earlyBuyCap - earlyTokensBought) return 0;
        }
    }

    function _quotePoolSell(uint256 vyntraIn) private view returns (uint256 nativeOut) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return 0;
        (, uint160 sqrtPriceLimitX96) = _sqrtPriceLimits();
        (, , nativeOut,) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(vyntraIn), POOL_FEE
        );
    }

    function _addLiquidity(PoolKey memory key, uint256 nativeSeed, uint256 tokenSeed)
        private
        returns (bytes memory)
    {
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 liquidity0 = _liquidityForAmount0(initialSqrtPriceX96, sqrtUpper, nativeSeed);
        uint256 liquidity1 = _liquidityForAmount1(sqrtLower, initialSqrtPriceX96, tokenSeed);
        uint256 liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        if (liquidity == 0 || liquidity > type(uint128).max) revert BadLiquidity();
        uint128 liquidityAmount = uint128(liquidity);

        for (uint256 i; i < 4; ++i) {
            uint256 nativeRequired = SqrtPriceMath.getAmount0Delta(initialSqrtPriceX96, sqrtUpper, liquidityAmount, true);
            uint256 tokenRequired = SqrtPriceMath.getAmount1Delta(sqrtLower, initialSqrtPriceX96, liquidityAmount, true);
            if (nativeRequired <= nativeSeed && tokenRequired <= tokenSeed) break;
            if (liquidityAmount <= 1) revert BadLiquidity();
            unchecked { --liquidityAmount; }
        }

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: int256(uint256(liquidityAmount)), salt: bytes32(0)}),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 < 0 || delta1 < 0) revert BadPoolDelta();
        uint256 nativeDue = uint256(uint128(delta0));
        uint256 tokenDue = uint256(uint128(delta1));
        if (nativeDue > nativeSeed || tokenDue > tokenSeed) revert BadPoolDelta();

        poolManager.sync(key.currency0);
        poolManager.settle{value: nativeDue}();
        poolManager.sync(key.currency1);
        if (!vyntra.transfer(address(poolManager), tokenDue)) revert BadPoolDelta();
        poolManager.settle();
        return abi.encode(nativeDue, tokenDue, liquidityAmount);
    }

    function _swapBuy(PoolKey memory key, address buyer, uint256 nativeIn, uint256 minOut)
        private
        returns (bytes memory)
    {
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: _negativeAmount(nativeIn), sqrtPriceLimitX96: sqrtPriceLimitX96}),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 < 0 || delta1 > 0) revert BadPoolDelta();
        uint256 nativeUsed = uint256(uint128(delta0));
        uint256 tokensOut = uint256(uint128(-delta1));
        if (tokensOut < minOut || tokensOut == 0) revert Slippage();
        poolManager.sync(key.currency0);
        poolManager.settle{value: nativeUsed}();
        poolManager.take(key.currency1, buyer, tokensOut);
        return abi.encode(tokensOut, nativeUsed);
    }

    function _swapSell(PoolKey memory key, address seller, uint256 tokenIn, uint256 minOut)
        private
        returns (bytes memory)
    {
        if (seller == address(0) || poolManager.getLiquidity(poolId) == 0) revert BadAmount();
        (, uint160 sqrtPriceLimitX96) = _sqrtPriceLimits();
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({zeroForOne: false, amountSpecified: _negativeAmount(tokenIn), sqrtPriceLimitX96: sqrtPriceLimitX96}),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 > 0 || delta1 < 0) revert BadPoolDelta();
        uint256 nativeOut = uint256(uint128(-delta0));
        uint256 tokensUsed = uint256(uint128(delta1));
        if (nativeOut < minOut || tokensUsed == 0) revert Slippage();
        poolManager.sync(key.currency1);
        if (!vyntra.transfer(address(poolManager), tokensUsed)) revert BadPoolDelta();
        poolManager.settle();
        poolManager.take(key.currency0, address(this), nativeOut);
        return abi.encode(nativeOut, tokensUsed);
    }

    function _collectPositionFees(PoolKey memory key) private returns (bytes memory) {
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: 0, salt: bytes32(0)}),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 < 0 || delta1 < 0) revert BadPoolDelta();
        uint256 nativeFees = uint256(uint128(delta0));
        uint256 tokenFees = uint256(uint128(delta1));
        if (nativeFees > 0) poolManager.take(key.currency0, address(this), nativeFees);
        if (tokenFees > 0) poolManager.take(key.currency1, address(this), tokenFees);
        return abi.encode(nativeFees, tokenFees);
    }

    function _unlock(bytes memory data) private returns (bytes memory result) {
        if (_unlockActive) revert BadCallback();
        _unlockActive = true;
        _expectedOperation = abi.decode(data, (uint8));
        result = poolManager.unlock(data);
        _expectedOperation = 0;
        _unlockActive = false;
    }

    function _poolKey() private view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(vyntra)),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });
    }

    function _sqrtPriceLimits() private pure returns (uint160 lower, uint160 upper) {
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        lower = TickMath.getSqrtPriceAtTick(tickLower) + 1;
        upper = TickMath.getSqrtPriceAtTick(tickUpper) - 1;
    }

    function _fullRangeTicks() private pure returns (int24 tickLower, int24 tickUpper) {
        tickLower = TickMath.minUsableTick(TICK_SPACING);
        tickUpper = TickMath.maxUsableTick(TICK_SPACING);
    }

    function _sqrtPriceForSeed(uint256 tokenAmount, uint256 nativeAmount) private pure returns (uint160) {
        uint256 ratioX192 = FullMath.mulDiv(tokenAmount, uint256(1) << 192, nativeAmount);
        uint256 root = _sqrt(ratioX192);
        if (root <= TickMath.MIN_SQRT_PRICE || root >= TickMath.MAX_SQRT_PRICE || root > type(uint160).max) {
            revert BadLiquidity();
        }
        return uint160(root);
    }

    function _liquidityForAmount0(uint160 sqrtA, uint160 sqrtB, uint256 amount0) private pure returns (uint256) {
        uint256 intermediate = FullMath.mulDiv(uint256(sqrtA), uint256(sqrtB), FixedPoint96.Q96);
        return FullMath.mulDiv(amount0, intermediate, uint256(sqrtB) - sqrtA);
    }

    function _liquidityForAmount1(uint160 sqrtA, uint160 sqrtB, uint256 amount1) private pure returns (uint256) {
        return FullMath.mulDiv(amount1, FixedPoint96.Q96, uint256(sqrtB) - sqrtA);
    }

    function _negativeAmount(uint256 amount) private pure returns (int256) {
        if (amount == 0 || amount > uint256(type(int256).max)) revert BadAmount();
        return -int256(amount);
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        uint256 x = value;
        result = (x + 1) >> 1;
        while (result < x) {
            x = result;
            result = (value / x + x) >> 1;
        }
        return x;
    }
}
