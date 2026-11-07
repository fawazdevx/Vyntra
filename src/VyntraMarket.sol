// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
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
/// @notice No-hook Uniswap v4 HYPE/VYNTRA market with a permanently locked seed position.
/// @dev Keeps the existing VYNTRA buy/sell API. There is no liquidity-removal or arbitrary-call path.
contract VyntraMarket is ReentrancyGuard, IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint24 public constant POOL_FEE = 10_000; // 1%
    int24 public constant TICK_SPACING = 200;
    uint256 public constant MIN_NATIVE_SEED = 5 ether;
    uint256 public constant MAX_NATIVE_SEED = 100 ether;
    uint256 public constant ANTI_SNIPE_BLOCKS = 3;
    uint256 public constant MAX_BUY_BPS_ANTI_SNIPE = 200;
    uint256 private constant BPS = 10_000;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    uint8 private constant OP_ADD_LIQUIDITY = 1;
    uint8 private constant OP_BUY = 2;
    uint8 private constant OP_SELL = 3;
    uint8 private constant OP_COLLECT_FEES = 4;

    IERC20 public immutable vyntra;
    IPoolManager public immutable poolManager;
    address public immutable owner;

    address public feeRecipient;
    bool public initialized;
    bool private _unlockActive;
    uint8 private _expectedOperation;
    uint160 public initialSqrtPriceX96;
    uint128 public initialLiquidity;
    PoolId public poolId;
    uint256 public seedBlock;
    uint256 public seededVyntra;
    uint256 public earlyTokensBought;

    event Seeded(uint256 nativeAmount, uint256 vyntraAmount);
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

    constructor(address vyntra_, address poolManager_) {
        if (
            vyntra_ == address(0) || poolManager_ == address(0)
                || vyntra_.code.length == 0 || poolManager_.code.length == 0
        ) revert BadConfig();
        vyntra = IERC20(vyntra_);
        poolManager = IPoolManager(poolManager_);
        owner = msg.sender;
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
    }

    /// @notice Set the protocol fee destination once, after the fee router is deployed.
    function setFeeRecipient(address recipient) external {
        if (msg.sender != owner) revert NotOwner();
        if (
            initialized || feeRecipient != address(0) || recipient == address(0)
                || recipient.code.length == 0
        ) {
            revert BadConfig();
        }
        feeRecipient = recipient;
        emit FeeRecipientConfigured(recipient);
    }

    /// @notice Initialize the v4 HYPE/VYNTRA pool and lock its full-range seed position.
    /// @dev The fixed seed and token allocation atomically determine the opening price.
    function seed(uint256 vyntraAmount) external payable nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        if (initialized) revert AlreadySeeded();
        if (feeRecipient == address(0)) revert BadConfig();
        if (msg.value < MIN_NATIVE_SEED || msg.value > MAX_NATIVE_SEED || vyntraAmount == 0) {
            revert BadAmount();
        }
        if (!vyntra.transferFrom(msg.sender, address(this), vyntraAmount)) revert BadAmount();

        initialized = true;
        seedBlock = block.number;
        seededVyntra = vyntraAmount;
        initialSqrtPriceX96 = _sqrtPriceForSeed(vyntraAmount, msg.value);
        PoolKey memory key = _poolKey();
        poolId = key.toId();
        poolManager.initialize(key, initialSqrtPriceX96);

        bytes memory result = _unlock(abi.encode(OP_ADD_LIQUIDITY, msg.value, vyntraAmount));
        (uint256 nativeUsed, uint256 tokenUsed, uint128 liquidity) =
            abi.decode(result, (uint256, uint256, uint128));
        initialLiquidity = liquidity;

        uint256 tokenDust = vyntra.balanceOf(address(this));
        if (tokenDust > 0 && !vyntra.transfer(BURN, tokenDust)) revert BadPoolDelta();
        uint256 nativeDust = address(this).balance;
        if (nativeDust > 0) {
            (bool sent,) = payable(msg.sender).call{value: nativeDust}("");
            if (!sent) revert SendFailed();
        }

        emit Seeded(nativeUsed, tokenUsed);
    }

    function reserveNative() external view returns (uint256 nativeAmount) {
        (nativeAmount,) = getReserves();
    }

    function reserveVyntra() external view returns (uint256 tokenAmount) {
        (, tokenAmount) = getReserves();
    }

    function getReserves() public view returns (uint256 nativeAmount, uint256 tokenAmount) {
        if (!initialized) return (0, 0);
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

    function quoteBuyVyntra(uint256 nativeIn) public view returns (uint256 vyntraOut) {
        if (!initialized || nativeIn == 0) return 0;
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return 0;
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        (, , vyntraOut,) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(nativeIn), POOL_FEE
        );
        if (block.number < seedBlock + ANTI_SNIPE_BLOCKS) {
            uint256 earlyBuyCap = (seededVyntra * MAX_BUY_BPS_ANTI_SNIPE) / BPS;
            if (earlyTokensBought >= earlyBuyCap || vyntraOut > earlyBuyCap - earlyTokensBought) return 0;
        }
    }

    function quoteSellVyntra(uint256 vyntraIn) public view returns (uint256 nativeOut) {
        if (!initialized || vyntraIn == 0) return 0;
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return 0;
        (, uint160 sqrtPriceLimitX96) = _sqrtPriceLimits();
        (, , nativeOut,) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(vyntraIn), POOL_FEE
        );
    }

    function buyVyntra(uint256 minVyntraOut)
        external
        payable
        nonReentrant
        returns (uint256 vyntraOut)
    {
        if (!initialized) revert NotSeeded();
        if (msg.value == 0) revert BadAmount();
        bytes memory result = _unlock(abi.encode(OP_BUY, msg.sender, msg.value, minVyntraOut));
        uint256 nativeUsed;
        (vyntraOut, nativeUsed) = abi.decode(result, (uint256, uint256));
        if (vyntraOut < minVyntraOut) revert Slippage();
        if (nativeUsed == 0 || vyntraOut == 0) revert BadAmount();
        if (block.number < seedBlock + ANTI_SNIPE_BLOCKS) {
            uint256 earlyBuyCap = (seededVyntra * MAX_BUY_BPS_ANTI_SNIPE) / BPS;
            if (earlyTokensBought + vyntraOut > earlyBuyCap) revert BadAmount();
            earlyTokensBought += vyntraOut;
        }
        uint256 refund = msg.value - nativeUsed;
        if (refund > 0) {
            (bool sent,) = payable(msg.sender).call{value: refund}("");
            if (!sent) revert SendFailed();
        }
        emit BuyVyntra(msg.sender, nativeUsed, vyntraOut);
    }

    function sellVyntra(uint256 vyntraIn, uint256 minNativeOut)
        external
        nonReentrant
        returns (uint256 nativeOut)
    {
        if (!initialized) revert NotSeeded();
        if (vyntraIn == 0 || !vyntra.transferFrom(msg.sender, address(this), vyntraIn)) {
            revert BadAmount();
        }
        bytes memory result = _unlock(abi.encode(OP_SELL, msg.sender, vyntraIn, minNativeOut));
        uint256 tokenUsed;
        (nativeOut, tokenUsed) = abi.decode(result, (uint256, uint256));
        if (nativeOut < minNativeOut) revert Slippage();
        if (nativeOut == 0 || tokenUsed == 0) revert BadAmount();
        uint256 tokenRefund = vyntraIn - tokenUsed;
        if (tokenRefund > 0 && !vyntra.transfer(msg.sender, tokenRefund)) revert BadPoolDelta();
        (bool sent,) = payable(msg.sender).call{value: nativeOut}("");
        if (!sent) revert SendFailed();
        emit SellVyntra(msg.sender, tokenUsed, nativeOut);
    }

    /// @notice Permissionlessly collect only accrued fees from the locked market position.
    function claimProtocolFees() external nonReentrant {
        if (!initialized) revert NotSeeded();
        if (feeRecipient == address(0)) revert BadConfig();
        bytes memory result = _unlock(abi.encode(OP_COLLECT_FEES));
        (uint256 nativeFees, uint256 tokenFees) = abi.decode(result, (uint256, uint256));
        if (tokenFees > 0 && !vyntra.transfer(BURN, tokenFees)) revert BadPoolDelta();
        if (nativeFees > 0) {
            (bool sent,) = payable(feeRecipient).call{value: nativeFees}("");
            if (!sent) revert SendFailed();
        }
        emit PoolFeesCollected(nativeFees, tokenFees);
    }

    function poolKey() external view returns (PoolKey memory) {
        return _poolKey();
    }

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
            (, address buyer, uint256 nativeIn, uint256 minOut) =
                abi.decode(data, (uint8, address, uint256, uint256));
            return _swapBuy(key, buyer, nativeIn, minOut);
        }
        if (operation == OP_SELL) {
            (, address seller, uint256 tokenIn, uint256 minOut) =
                abi.decode(data, (uint8, address, uint256, uint256));
            return _swapSell(key, seller, tokenIn, minOut);
        }
        if (operation == OP_COLLECT_FEES) return _collectPositionFees(key);
        revert BadCallback();
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
            uint256 nativeRequired = SqrtPriceMath.getAmount0Delta(
                initialSqrtPriceX96, sqrtUpper, liquidityAmount, true
            );
            uint256 tokenRequired = SqrtPriceMath.getAmount1Delta(
                sqrtLower, initialSqrtPriceX96, liquidityAmount, true
            );
            if (nativeRequired <= nativeSeed && tokenRequired <= tokenSeed) break;
            if (liquidityAmount <= 1) revert BadLiquidity();
            unchecked { --liquidityAmount; }
        }

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidityAmount)),
                salt: bytes32(0)
            }),
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
        if (poolManager.getLiquidity(poolId) == 0) revert NotSeeded();
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

    function _liquidityForAmount0(uint160 sqrtA, uint160 sqrtB, uint256 amount0)
        private
        pure
        returns (uint256)
    {
        uint256 intermediate = FullMath.mulDiv(uint256(sqrtA), uint256(sqrtB), FixedPoint96.Q96);
        return FullMath.mulDiv(amount0, intermediate, uint256(sqrtB) - sqrtA);
    }

    function _liquidityForAmount1(uint160 sqrtA, uint160 sqrtB, uint256 amount1)
        private
        pure
        returns (uint256)
    {
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
