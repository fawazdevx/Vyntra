// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VyntraToken} from "./VyntraToken.sol";
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

/// @title VyntraCurve
/// @notice Compatibility name for Vyntra's Uniswap v4 market and permanent liquidity lock.
/// @dev The pool has no hook. This contract owns one full-range position and intentionally has
///      no code path that can reduce or transfer its principal liquidity.
contract VyntraCurve is ReentrancyGuard, IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 public constant FEE_BPS = 100; // 1% Uniswap v4 LP fee
    uint256 public constant BPS = 10_000;
    uint256 public constant CREATOR_FEE_SHARE_BPS = 5_000;
    uint256 public constant ANTI_SNIPE_BLOCKS = 3;
    uint256 public constant MAX_BUY_BPS_ANTI_SNIPE = 200;
    uint24 public constant POOL_FEE = 10_000; // fee units are hundredths of a bip
    int24 public constant TICK_SPACING = 200;
    address public constant LP_BURN = 0x000000000000000000000000000000000000dEaD;

    uint8 private constant OP_ADD_LIQUIDITY = 1;
    uint8 private constant OP_BUY = 2;
    uint8 private constant OP_SELL = 3;
    uint8 private constant OP_COLLECT_FEES = 4;

    VyntraToken public immutable token;
    address public immutable creator;
    address public immutable protocolTreasury;
    address public immutable factory;
    address public immutable splitter;
    IPoolManager public immutable poolManager;

    uint256 public immutable graduationThreshold;
    uint256 public immutable launchBlock;
    uint256 public immutable totalSupply;
    uint256 public immutable minInitialLiquidity;
    uint256 public immutable maxInitialLiquidity;

    uint256 public realNativeReserves;
    uint256 public tokensSold;
    uint256 public earlyTokensBought;
    bool public graduated;
    bool public migrated; // retained for old clients; v4 pools never migrate
    address public externalPair; // v4 pools live in PoolManager and have no pair address

    uint256 public creatorFees;
    uint256 public protocolFees;
    mapping(address => uint256) public referrerFees;

    bool public initialized;
    bool private _unlockActive;
    uint8 private _expectedOperation;
    uint160 public initialSqrtPriceX96;
    uint128 public initialLiquidity;
    PoolId public poolId;

    event Buy(address indexed buyer, address indexed referrer, uint256 nativeIn, uint256 tokensOut, uint256 fee);
    event Sell(address indexed seller, uint256 tokensIn, uint256 nativeOut, uint256 fee);
    event TaxCollected(address indexed trader, bool isBuy, uint256 memeTax);
    event Graduated(address indexed token, uint256 nativeLiquidity, uint256 tokenLiquidity);
    event MigratedToUniswap(
        address indexed token,
        address indexed pair,
        uint256 nativeAmount,
        uint256 tokenAmount,
        uint256 liquidity
    );
    event FeesClaimed(address indexed account, uint256 amount);
    event LiquidityInjected(uint256 amount);
    event V4PoolInitialized(
        address indexed token,
        bytes32 indexed poolId,
        uint160 sqrtPriceX96,
        uint256 nativeSeed,
        uint256 tokenSeed,
        uint128 liquidity
    );
    event V4FeesCollected(uint256 creatorNative, uint256 protocolNative, uint256 creatorToken);

    error Slippage();
    error AntiSnipe();
    error ZeroAmount();
    error InsufficientLiquidity();
    error NotSplitter();
    error Migrated();
    error NotGraduated();
    error NoRouter();
    error AlreadyMigrated();
    error MigrateFailed();
    error NothingToClaim();
    error BadConfig();
    error NotFactory();
    error NotPoolManager();
    error AlreadyInitialized();
    error BadInitialLiquidity();
    error BadPoolDelta();
    error MigrationDisabled();

    constructor(
        address token_,
        address creator_,
        address protocolTreasury_,
        address factory_,
        uint256 graduationThreshold_,
        uint256 totalSupply_,
        address splitter_,
        address poolManager_,
        uint256 minInitialLiquidity_,
        uint256 maxInitialLiquidity_
    ) {
        if (
            token_ == address(0) || creator_ == address(0) || protocolTreasury_ == address(0)
                || factory_ == address(0) || poolManager_ == address(0)
                || poolManager_.code.length == 0 || minInitialLiquidity_ == 0
                || maxInitialLiquidity_ < minInitialLiquidity_
        ) revert BadConfig();

        token = VyntraToken(token_);
        creator = creator_;
        protocolTreasury = protocolTreasury_;
        factory = factory_;
        splitter = splitter_;
        poolManager = IPoolManager(poolManager_);
        graduationThreshold = graduationThreshold_;
        totalSupply = totalSupply_;
        minInitialLiquidity = minInitialLiquidity_;
        maxInitialLiquidity = maxInitialLiquidity_;
        launchBlock = block.number;
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
    }

    /// @notice Initializes the no-hook v4 pool and permanently locks the full-range position.
    /// @dev Factory calls this inside the same transaction that deploys the token and market.
    function initializePool() external payable nonReentrant {
        if (msg.sender != factory) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        if (msg.value < minInitialLiquidity || msg.value > maxInitialLiquidity) revert BadInitialLiquidity();

        initialized = true;
        initialSqrtPriceX96 = _sqrtPriceForSeed(totalSupply, msg.value);
        PoolKey memory key = _poolKey();
        poolId = key.toId();

        poolManager.initialize(key, initialSqrtPriceX96);
        bytes memory result = _unlock(abi.encode(OP_ADD_LIQUIDITY, msg.value));
        (uint256 nativeUsed, uint256 tokenUsed, uint128 liquidity) = abi.decode(result, (uint256, uint256, uint128));
        initialLiquidity = liquidity;

        uint256 tokenDust = token.balanceOf(address(this));
        if (tokenDust > 0) require(token.transfer(LP_BURN, tokenDust), "BURN_DUST");

        uint256 nativeDust = address(this).balance;
        if (nativeDust > 0) {
            (bool refunded,) = payable(factory).call{value: nativeDust}("");
            require(refunded, "SEED_REFUND");
        }

        emit V4PoolInitialized(address(token), PoolId.unwrap(poolId), initialSqrtPriceX96, nativeUsed, tokenUsed, liquidity);
        emit LiquidityInjected(nativeUsed);
    }

    function poolKey() external view returns (PoolKey memory) {
        return _poolKey();
    }

    function buyTaxBps() external pure returns (uint256) {
        return 0;
    }

    function sellTaxBps() external pure returns (uint256) {
        return 0;
    }

    function getReserves() public view returns (uint256 nativeReserves, uint256 tokenReserves) {
        if (!initialized) return (0, 0);
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        nativeReserves = SqrtPriceMath.getAmount0Delta(sqrtPriceX96, sqrtUpper, liquidity, false);
        tokenReserves = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtPriceX96, liquidity, false);
    }

    function getProgressBps() public view returns (uint256) {
        if (graduated) return BPS;
        if (graduationThreshold == 0) return 0;
        uint256 p = (realNativeReserves * BPS) / graduationThreshold;
        return p > BPS ? BPS : p;
    }

    /// @notice Graduation is a status milestone. Swaps continue against this same v4 pool forever.
    function tradeVenue() external pure returns (string memory) {
        return "uniswap-v4";
    }

    function uniswapV2Router() external pure returns (address) {
        return address(0);
    }

    function quoteBuy(uint256 nativeIn) public view returns (uint256 tokensOut, uint256 fee) {
        if (!initialized || nativeIn == 0) return (0, 0);
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        (, , tokensOut, fee) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(nativeIn), POOL_FEE
        );
        if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
            uint256 earlyBuyCap = (totalSupply * MAX_BUY_BPS_ANTI_SNIPE) / BPS;
            if (earlyTokensBought >= earlyBuyCap || tokensOut > earlyBuyCap - earlyTokensBought) return (0, 0);
        }
    }

    function quoteBuyDetailed(uint256 nativeIn)
        external
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 memeTax)
    {
        (tokensOut, protocolFee) = quoteBuy(nativeIn);
        memeTax = 0;
    }

    function quoteSell(uint256 tokensIn) public view returns (uint256 nativeOut, uint256 fee) {
        if (!initialized || tokensIn == 0) return (0, 0);
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
        (, uint160 sqrtPriceLimitX96) = _sqrtPriceLimits();
        (, , nativeOut,) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(tokensIn), POOL_FEE
        );
        (, , uint256 grossNativeOut,) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(tokensIn), 0
        );
        fee = grossNativeOut > nativeOut ? grossNativeOut - nativeOut : 0;
    }

    function quoteSellDetailed(uint256 tokensIn)
        external
        view
        returns (uint256 nativeOut, uint256 protocolFee, uint256 memeTax)
    {
        (nativeOut, protocolFee) = quoteSell(tokensIn);
        memeTax = 0;
    }

    function buy(uint256 minTokensOut, address referrer)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        return _buy(msg.sender, minTokensOut, referrer);
    }

    function buyFor(address beneficiary, uint256 minTokensOut, address referrer)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (msg.sender != factory) revert AntiSnipe();
        return _buy(beneficiary, minTokensOut, referrer);
    }

    function _buy(address beneficiary, uint256 minTokensOut, address referrer)
        internal
        returns (uint256 tokensOut)
    {
        if (!initialized) revert InsufficientLiquidity();
        if (msg.value == 0) revert ZeroAmount();

        bytes memory result = _unlock(abi.encode(OP_BUY, beneficiary, msg.value, minTokensOut));
        uint256 nativeUsed;
        uint256 fee;
        (tokensOut, nativeUsed, fee) = abi.decode(result, (uint256, uint256, uint256));
        if (tokensOut < minTokensOut) revert Slippage();
        if (tokensOut == 0 || nativeUsed == 0) revert InsufficientLiquidity();

        if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
            uint256 earlyBuyCap = (totalSupply * MAX_BUY_BPS_ANTI_SNIPE) / BPS;
            if (earlyTokensBought + tokensOut > earlyBuyCap) revert AntiSnipe();
            earlyTokensBought += tokensOut;
        }

        realNativeReserves += nativeUsed;
        tokensSold += tokensOut;
        emit Buy(beneficiary, referrer, nativeUsed, tokensOut, fee);
        if (!graduated && realNativeReserves >= graduationThreshold) _graduate();

        uint256 refund = msg.value - nativeUsed;
        if (refund > 0) {
            (bool sent,) = payable(msg.sender).call{value: refund}("");
            require(sent, "REFUND");
        }
    }

    function sell(uint256 tokensIn, uint256 minNativeOut) external nonReentrant returns (uint256 nativeOut) {
        if (!initialized) revert InsufficientLiquidity();
        if (tokensIn == 0) revert ZeroAmount();
        require(token.transferFrom(msg.sender, address(this), tokensIn), "TRANSFER_FROM");

        bytes memory result = _unlock(abi.encode(OP_SELL, msg.sender, tokensIn, minNativeOut));
        uint256 tokenUsed;
        uint256 fee;
        (nativeOut, tokenUsed, fee) = abi.decode(result, (uint256, uint256, uint256));
        if (nativeOut < minNativeOut) revert Slippage();
        if (nativeOut == 0 || tokenUsed == 0) revert InsufficientLiquidity();

        uint256 tokenRefund = tokensIn - tokenUsed;
        if (tokenRefund > 0) require(token.transfer(msg.sender, tokenRefund), "TOKEN_REFUND");
        tokensSold = tokenUsed >= tokensSold ? 0 : tokensSold - tokenUsed;
        realNativeReserves = nativeOut >= realNativeReserves ? 0 : realNativeReserves - nativeOut;
        emit Sell(msg.sender, tokenUsed, nativeOut, fee);

        (bool sent,) = payable(msg.sender).call{value: nativeOut}("");
        require(sent, "NATIVE_SEND");
    }

    /// @notice Collects only fees from the locked position; principal cannot be withdrawn.
    function claimCreatorFees() external nonReentrant {
        if (msg.sender != creator) revert BadConfig();
        _collectFees();
        uint256 amount = creatorFees;
        if (amount == 0) return;
        creatorFees = 0;
        (bool sent,) = payable(creator).call{value: amount}("");
        require(sent, "CREATOR_SEND");
        emit FeesClaimed(creator, amount);
    }

    /// @notice Permissionless protocol fee collection for the buyback / ops fee router.
    function claimProtocolFees() external nonReentrant {
        _collectFees();
        uint256 amount = protocolFees;
        if (amount == 0) return;
        protocolFees = 0;
        (bool sent,) = payable(protocolTreasury).call{value: amount}("");
        require(sent, "PROTOCOL_SEND");
        emit FeesClaimed(protocolTreasury, amount);
    }

    function claimReferrerFees(address) external pure {
        revert NothingToClaim();
    }

    function injectNativeLiquidity() external payable {
        revert MigrationDisabled();
    }

    function migrateToUniswap() external pure {
        revert MigrationDisabled();
    }

    function accruedFees() public view returns (uint256) {
        return creatorFees + protocolFees;
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory result) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        uint8 operation = abi.decode(data, (uint8));
        if (!_unlockActive || operation != _expectedOperation) revert BadConfig();
        PoolKey memory key = _poolKey();

        if (operation == OP_ADD_LIQUIDITY) {
            (, uint256 nativeSeed) = abi.decode(data, (uint8, uint256));
            return _addInitialLiquidity(key, nativeSeed);
        }
        if (operation == OP_BUY) {
            (, address buyer, uint256 nativeIn, uint256 minTokensOut) =
                abi.decode(data, (uint8, address, uint256, uint256));
            return _swapBuy(key, buyer, nativeIn, minTokensOut);
        }
        if (operation == OP_SELL) {
            (, address seller, uint256 tokensIn, uint256 minNativeOut) =
                abi.decode(data, (uint8, address, uint256, uint256));
            return _swapSell(key, seller, tokensIn, minNativeOut);
        }
        if (operation == OP_COLLECT_FEES) {
            return _collectPositionFees(key);
        }
        revert BadConfig();
    }

    function _addInitialLiquidity(PoolKey memory key, uint256 nativeSeed) private returns (bytes memory) {
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 liquidity0 = _liquidityForAmount0(initialSqrtPriceX96, sqrtUpper, nativeSeed);
        uint256 liquidity1 = _liquidityForAmount1(sqrtLower, initialSqrtPriceX96, totalSupply);
        uint256 liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        if (liquidity == 0 || liquidity > type(uint128).max) revert InsufficientLiquidity();

        uint128 liquidityAmount = uint128(liquidity);
        for (uint256 i; i < 4; ++i) {
            uint256 nativeRequired = SqrtPriceMath.getAmount0Delta(
                initialSqrtPriceX96, sqrtUpper, liquidityAmount, true
            );
            uint256 tokenRequired = SqrtPriceMath.getAmount1Delta(
                sqrtLower, initialSqrtPriceX96, liquidityAmount, true
            );
            if (nativeRequired <= nativeSeed && tokenRequired <= totalSupply) break;
            if (liquidityAmount <= 1) revert BadInitialLiquidity();
            unchecked {
                --liquidityAmount;
            }
        }
        if (
            SqrtPriceMath.getAmount0Delta(initialSqrtPriceX96, sqrtUpper, liquidityAmount, true) > nativeSeed
                || SqrtPriceMath.getAmount1Delta(sqrtLower, initialSqrtPriceX96, liquidityAmount, true) > totalSupply
        ) revert BadInitialLiquidity();

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
        if (nativeDue > nativeSeed || tokenDue > totalSupply) revert BadInitialLiquidity();

        poolManager.sync(key.currency0);
        poolManager.settle{value: nativeDue}();
        poolManager.sync(key.currency1);
        require(token.transfer(address(poolManager), tokenDue), "LP_TOKEN");
        poolManager.settle();

        return abi.encode(nativeDue, tokenDue, liquidityAmount);
    }

    function _swapBuy(PoolKey memory key, address buyer, uint256 nativeIn, uint256 minTokensOut)
        private
        returns (bytes memory)
    {
        (uint160 sqrtBefore,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (liquidity == 0) revert InsufficientLiquidity();
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        (,,, uint256 fee) = SwapMath.computeSwapStep(
            sqrtBefore, sqrtPriceLimitX96, liquidity, _negativeAmount(nativeIn), POOL_FEE
        );
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: _negativeAmount(nativeIn),
                sqrtPriceLimitX96: sqrtPriceLimitX96
            }),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 < 0 || delta1 > 0) revert BadPoolDelta();
        uint256 nativeUsed = uint256(uint128(delta0));
        uint256 tokensOut = uint256(uint128(-delta1));
        if (tokensOut < minTokensOut) revert Slippage();

        poolManager.sync(key.currency0);
        poolManager.settle{value: nativeUsed}();
        poolManager.take(key.currency1, buyer, tokensOut);
        return abi.encode(tokensOut, nativeUsed, fee);
    }

    function _swapSell(PoolKey memory key, address seller, uint256 tokensIn, uint256 minNativeOut)
        private
        returns (bytes memory)
    {
        (uint160 sqrtBefore,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (liquidity == 0) revert InsufficientLiquidity();
        if (seller == address(0)) revert BadConfig();
        (, uint160 sqrtPriceLimitX96) = _sqrtPriceLimits();
        (, , uint256 grossNativeOut,) = SwapMath.computeSwapStep(
            sqrtBefore, sqrtPriceLimitX96, liquidity, _negativeAmount(tokensIn), 0
        );

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: _negativeAmount(tokensIn),
                sqrtPriceLimitX96: sqrtPriceLimitX96
            }),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 > 0 || delta1 < 0) revert BadPoolDelta();
        uint256 nativeOut = uint256(uint128(-delta0));
        uint256 tokensUsed = uint256(uint128(delta1));
        if (nativeOut < minNativeOut) revert Slippage();

        poolManager.sync(key.currency1);
        require(token.transfer(address(poolManager), tokensUsed), "SWAP_TOKEN");
        poolManager.settle();
        poolManager.take(key.currency0, address(this), nativeOut);
        uint256 feeNative = grossNativeOut > nativeOut ? grossNativeOut - nativeOut : 0;
        return abi.encode(nativeOut, tokensUsed, feeNative);
    }

    function _collectFees() private {
        bytes memory result = _unlock(abi.encode(OP_COLLECT_FEES));
        (uint256 nativeFees, uint256 tokenFees) = abi.decode(result, (uint256, uint256));
        uint256 creatorCut = (nativeFees * CREATOR_FEE_SHARE_BPS) / BPS;
        uint256 protocolCut = nativeFees - creatorCut;
        creatorFees += creatorCut;
        protocolFees += protocolCut;
        if (tokenFees > 0) require(token.transfer(creator, tokenFees), "TOKEN_FEE_SEND");
        emit V4FeesCollected(creatorCut, protocolCut, tokenFees);
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

    function _graduate() private {
        graduated = true;
        (uint256 nativeLiquidity, uint256 tokenLiquidity) = getReserves();
        emit Graduated(address(token), nativeLiquidity, tokenLiquidity);
    }

    function _poolKey() private view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(token)),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });
    }

    function _unlock(bytes memory data) private returns (bytes memory result) {
        if (_unlockActive) revert BadConfig();
        _unlockActive = true;
        _expectedOperation = abi.decode(data, (uint8));
        result = poolManager.unlock(data);
        _expectedOperation = 0;
        _unlockActive = false;
    }

    function _sqrtPriceLimits() private pure returns (uint160 lower, uint160 upper) {
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        lower = TickMath.getSqrtPriceAtTick(tickLower) + 1;
        upper = TickMath.getSqrtPriceAtTick(tickUpper) - 1;
    }

    function _negativeAmount(uint256 amount) private pure returns (int256) {
        if (amount == 0 || amount > uint256(type(int256).max)) revert BadConfig();
        return -int256(amount);
    }

    function _fullRangeTicks() private pure returns (int24 tickLower, int24 tickUpper) {
        tickLower = TickMath.minUsableTick(TICK_SPACING);
        tickUpper = TickMath.maxUsableTick(TICK_SPACING);
    }

    function _sqrtPriceForSeed(uint256 tokenAmount, uint256 nativeAmount) private pure returns (uint160) {
        uint256 ratioX192 = FullMath.mulDiv(tokenAmount, uint256(1) << 192, nativeAmount);
        uint256 root = _sqrt(ratioX192);
        if (root <= TickMath.MIN_SQRT_PRICE || root >= TickMath.MAX_SQRT_PRICE || root > type(uint160).max) {
            revert BadInitialLiquidity();
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
