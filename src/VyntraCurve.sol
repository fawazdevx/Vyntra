// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VyntraToken} from "./VyntraToken.sol";
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

/// @title VyntraCurve
/// @notice Buyer-funded linear bonding curve that graduates into a permanently locked V4 pool.
/// @dev Creation never requires HYPE. 60% of supply is sold on the curve and 40% is reserved
///      for the locked pool. The curve is calibrated to raise the graduation threshold and join
///      the V4 pool at the same price. No hook or liquidity-removal path exists.
contract VyntraCurve is ReentrancyGuard, IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 public constant FEE_BPS = 100;
    uint256 public constant BPS = 10_000;
    uint256 public constant CREATOR_FEE_SHARE_BPS = 5_000;
    uint256 public constant ANTI_SNIPE_BLOCKS = 3;
    uint256 public constant MAX_BUY_BPS_ANTI_SNIPE = 200;
    uint256 public constant CURVE_SALE_BPS = 6_000;
    uint24 public constant POOL_FEE = 10_000;
    int24 public constant TICK_SPACING = 200;
    address public constant LP_BURN = 0x000000000000000000000000000000000000dEaD;

    uint8 private constant OP_ADD_LIQUIDITY = 1;
    uint8 private constant OP_BUY = 2;
    uint8 private constant OP_SELL = 3;
    uint8 private constant OP_COLLECT_FEES = 4;

    VyntraToken public immutable token;
    address public immutable creator;
    address public creatorFeeRecipient;
    address public immutable protocolTreasury;
    address public immutable factory;
    address public immutable splitter;
    IPoolManager public immutable poolManager;

    uint256 public immutable graduationThreshold;
    uint256 public immutable launchBlock;
    uint256 public immutable totalSupply;
    uint256 public immutable curveTokenSupply;
    uint256 public immutable poolTokenAllocation;

    uint256 public realNativeReserves;
    uint256 public tokensSold;
    uint256 public earlyTokensBought;
    bool public graduated;
    bool public migrated; // retained for clients that still read the old field
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

    event CurveOpened(address indexed token, uint256 curveTokenSupply, uint256 poolTokenAllocation, uint256 graduationThreshold);
    event Buy(address indexed buyer, address indexed referrer, uint256 nativeIn, uint256 tokensOut, uint256 fee);
    event Sell(address indexed seller, uint256 tokensIn, uint256 nativeOut, uint256 fee);
    event TaxCollected(address indexed trader, bool isBuy, uint256 memeTax);
    event Graduated(address indexed token, uint256 nativeLiquidity, uint256 tokenLiquidity);
    event MigratedToUniswap(address indexed token, address indexed pair, uint256 nativeAmount, uint256 tokenAmount, uint256 liquidity);
    event FeesClaimed(address indexed account, uint256 amount);
    event V4PoolInitialized(address indexed token, bytes32 indexed poolId, uint160 sqrtPriceX96, uint256 nativeSeed, uint256 tokenSeed, uint128 liquidity);
    event V4FeesCollected(uint256 creatorNative, uint256 protocolNative, uint256 creatorToken);
    event CreatorFeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    error Slippage();
    error AntiSnipe();
    error ZeroAmount();
    error InsufficientLiquidity();
    error Migrated();
    error NoRouter();
    error AlreadyMigrated();
    error MigrateFailed();
    error NothingToClaim();
    error BadConfig();
    error NotFactory();
    error NotPoolManager();
    error AlreadyInitialized();
    error BadPoolDelta();
    error MigrationDisabled();
    error BadCurveAmount();

    constructor(
        address token_,
        address creator_,
        address protocolTreasury_,
        address factory_,
        uint256 graduationThreshold_,
        uint256 totalSupply_,
        address splitter_,
        address poolManager_,
        address creatorFeeRecipient_
    ) {
        if (
            token_ == address(0) || creator_ == address(0) || protocolTreasury_ == address(0)
                || factory_ == address(0) || poolManager_ == address(0)
                || creatorFeeRecipient_ == address(0)
                || poolManager_.code.length == 0 || graduationThreshold_ == 0
                || graduationThreshold_ > 1e36 || totalSupply_ < 2
        ) revert BadConfig();

        (uint256 curveSupply, uint256 poolAllocation) = BondingCurveMath.allocations(totalSupply_);
        (uint256 startPrice, uint256 endPrice) = BondingCurveMath.startAndEndPriceWad(
            graduationThreshold_, curveSupply, poolAllocation
        );
        if (curveSupply == 0 || poolAllocation == 0 || startPrice == 0 || endPrice <= startPrice) {
            revert BadConfig();
        }

        token = VyntraToken(token_);
        creator = creator_;
        creatorFeeRecipient = creatorFeeRecipient_;
        protocolTreasury = protocolTreasury_;
        factory = factory_;
        splitter = splitter_;
        poolManager = IPoolManager(poolManager_);
        graduationThreshold = graduationThreshold_;
        totalSupply = totalSupply_;
        curveTokenSupply = curveSupply;
        poolTokenAllocation = poolAllocation;
        launchBlock = block.number;
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
    }

    /// @notice Factory opens the market after transferring the fixed token supply.
    function initializeCurve() external {
        if (msg.sender != factory) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        if (token.balanceOf(address(this)) != totalSupply) revert BadConfig();
        initialized = true;
        emit CurveOpened(address(token), curveTokenSupply, poolTokenAllocation, graduationThreshold);
    }

    function buyTaxBps() external pure returns (uint256) { return 0; }
    function sellTaxBps() external pure returns (uint256) { return 0; }

    /// @notice Curve cash and remaining sale inventory before graduation; live V4 amounts afterward.
    function getReserves() public view returns (uint256 nativeReserves, uint256 tokenReserves) {
        if (graduated) {
            (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
            uint128 liquidity = poolManager.getLiquidity(poolId);
            if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
            (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
            nativeReserves = SqrtPriceMath.getAmount0Delta(
                sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickUpper), liquidity, false
            );
            tokenReserves = SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtPriceAtTick(tickLower), sqrtPriceX96, liquidity, false
            );
            return (nativeReserves, tokenReserves);
        }
        nativeReserves = realNativeReserves;
        tokenReserves = curveTokenSupply > tokensSold ? curveTokenSupply - tokensSold : 0;
    }

    function spotPriceWad() external view returns (uint256) {
        if (!graduated) {
            return BondingCurveMath.spotPriceWad(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold
            );
        }
        (uint256 nativeReserves, uint256 tokenReserves) = getReserves();
        if (tokenReserves == 0) return 0;
        return FullMath.mulDiv(nativeReserves, 1e18, tokenReserves);
    }

    function getProgressBps() public view returns (uint256) {
        if (graduated) return BPS;
        if (graduationThreshold == 0) return 0;
        uint256 progress = FullMath.mulDiv(realNativeReserves, BPS, graduationThreshold);
        return progress > BPS ? BPS : progress;
    }

    function tradeVenue() external view returns (string memory) {
        return graduated ? "uniswap-v4" : "bonding-curve";
    }

    function uniswapV2Router() external pure returns (address) { return address(0); }

    function quoteBuy(uint256 nativeIn) public view returns (uint256 tokensOut, uint256 fee) {
        if (!initialized || nativeIn == 0) return (0, 0);
        if (graduated) return _quoteV4Buy(nativeIn);
        (tokensOut,, fee,) = _quoteCurveBuy(nativeIn);
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
        if (graduated) return _quoteV4Sell(tokensIn);
        if (tokensIn > tokensSold) return (0, 0);
        uint256 newSold = tokensSold - tokensIn;
        uint256 grossOut = BondingCurveMath.quoteForTokens(
            graduationThreshold, curveTokenSupply, poolTokenAllocation, newSold, tokensIn
        );
        if (grossOut > realNativeReserves) grossOut = realNativeReserves;
        fee = FullMath.mulDiv(grossOut, FEE_BPS, BPS);
        nativeOut = grossOut - fee;
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
        if (msg.value == 0 || beneficiary == address(0)) revert ZeroAmount();

        uint256 nativeUsed;
        uint256 fee;
        uint256 valueUsed;
        if (!graduated) {
            uint256 grossUsed;
            (tokensOut, nativeUsed, fee, grossUsed) = _quoteCurveBuy(msg.value);
            if (tokensOut == 0 || nativeUsed == 0) revert InsufficientLiquidity();
            if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
                uint256 earlyBuyCap = FullMath.mulDiv(totalSupply, MAX_BUY_BPS_ANTI_SNIPE, BPS);
                if (earlyTokensBought + tokensOut > earlyBuyCap) revert AntiSnipe();
                earlyTokensBought += tokensOut;
            }

            realNativeReserves += nativeUsed;
            tokensSold += tokensOut;
            _recordCurveFee(fee);
            if (!token.transfer(beneficiary, tokensOut)) revert BadPoolDelta();
            valueUsed = grossUsed;
            emit Buy(beneficiary, referrer, grossUsed, tokensOut, fee);

            if (tokensSold >= curveTokenSupply) _graduate();
        } else {
            bytes memory result = _unlock(abi.encode(OP_BUY, beneficiary, msg.value, minTokensOut));
            (tokensOut, nativeUsed, fee) = abi.decode(result, (uint256, uint256, uint256));
            if (tokensOut < minTokensOut) revert Slippage();
            if (tokensOut == 0 || nativeUsed == 0) revert InsufficientLiquidity();
            if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
                uint256 earlyBuyCap = FullMath.mulDiv(totalSupply, MAX_BUY_BPS_ANTI_SNIPE, BPS);
                if (earlyTokensBought + tokensOut > earlyBuyCap) revert AntiSnipe();
                earlyTokensBought += tokensOut;
            }
            realNativeReserves += nativeUsed;
            valueUsed = nativeUsed;
            emit Buy(beneficiary, referrer, nativeUsed, tokensOut, fee);
        }

        if (tokensOut < minTokensOut) revert Slippage();
        uint256 refund = msg.value - valueUsed;
        if (refund > 0) {
            (bool sent,) = payable(msg.sender).call{value: refund}("");
            require(sent, "REFUND");
        }
    }

    function sell(uint256 tokensIn, uint256 minNativeOut) external nonReentrant returns (uint256 nativeOut) {
        if (!initialized) revert InsufficientLiquidity();
        if (tokensIn == 0) revert ZeroAmount();
        if (!token.transferFrom(msg.sender, address(this), tokensIn)) revert BadPoolDelta();

        uint256 tokenUsed;
        uint256 fee;
        if (!graduated) {
            if (tokensIn > tokensSold) revert BadCurveAmount();
            tokenUsed = tokensIn;
            uint256 newSold = tokensSold - tokenUsed;
            uint256 grossOut = BondingCurveMath.quoteForTokens(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, newSold, tokenUsed
            );
            if (grossOut > realNativeReserves) grossOut = realNativeReserves;
            fee = FullMath.mulDiv(grossOut, FEE_BPS, BPS);
            nativeOut = grossOut - fee;
            if (nativeOut < minNativeOut || nativeOut == 0) revert Slippage();

            tokensSold = newSold;
            realNativeReserves -= grossOut;
            _recordCurveFee(fee);
            emit Sell(msg.sender, tokenUsed, nativeOut, fee);
        } else {
            bytes memory result = _unlock(abi.encode(OP_SELL, msg.sender, tokensIn, minNativeOut));
            (nativeOut, tokenUsed, fee) = abi.decode(result, (uint256, uint256, uint256));
            if (nativeOut < minNativeOut) revert Slippage();
            if (nativeOut == 0 || tokenUsed == 0) revert InsufficientLiquidity();
            uint256 tokenRefund = tokensIn - tokenUsed;
            if (tokenRefund > 0 && !token.transfer(msg.sender, tokenRefund)) revert BadPoolDelta();
            realNativeReserves = nativeOut >= realNativeReserves ? 0 : realNativeReserves - nativeOut;
            emit Sell(msg.sender, tokenUsed, nativeOut, fee);
        }

        (bool sent,) = payable(msg.sender).call{value: nativeOut}("");
        require(sent, "NATIVE_SEND");
    }

    function claimCreatorFees() external nonReentrant {
        if (msg.sender != creator) revert BadConfig();
        _collectV4Fees();
        uint256 amount = creatorFees;
        if (amount == 0) return;
        creatorFees = 0;
        address recipient = creatorFeeRecipient;
        (bool sent,) = payable(recipient).call{value: amount}("");
        require(sent, "CREATOR_SEND");
        emit FeesClaimed(recipient, amount);
    }

    /// @notice Lets the launch creator redirect future and unclaimed creator fees.
    function setCreatorFeeRecipient(address recipient) external {
        if (msg.sender != creator) revert BadConfig();
        if (recipient == address(0)) revert BadConfig();
        address previous = creatorFeeRecipient;
        creatorFeeRecipient = recipient;
        emit CreatorFeeRecipientUpdated(previous, recipient);
    }

    function claimProtocolFees() external nonReentrant {
        _collectV4Fees();
        uint256 amount = protocolFees;
        if (amount == 0) return;
        protocolFees = 0;
        (bool sent,) = payable(protocolTreasury).call{value: amount}("");
        require(sent, "PROTOCOL_SEND");
        emit FeesClaimed(protocolTreasury, amount);
    }

    function claimReferrerFees(address) external pure { revert NothingToClaim(); }
    function injectNativeLiquidity() external payable { revert MigrationDisabled(); }
    function migrateToUniswap() external pure { revert MigrationDisabled(); }
    function accruedFees() public view returns (uint256) { return creatorFees + protocolFees; }
    function poolKey() external view returns (PoolKey memory) { return _poolKey(); }

    function unlockCallback(bytes calldata data) external returns (bytes memory result) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        uint8 operation = abi.decode(data, (uint8));
        if (!_unlockActive || operation != _expectedOperation) revert BadConfig();
        PoolKey memory key = _poolKey();

        if (operation == OP_ADD_LIQUIDITY) {
            (, uint256 nativeAmount) = abi.decode(data, (uint8, uint256));
            return _addInitialLiquidity(key, nativeAmount);
        }
        if (operation == OP_BUY) {
            (, address buyer, uint256 nativeIn, uint256 minOut) =
                abi.decode(data, (uint8, address, uint256, uint256));
            return _swapBuy(key, buyer, nativeIn, minOut);
        }
        if (operation == OP_SELL) {
            (, address seller, uint256 tokensIn, uint256 minOut) =
                abi.decode(data, (uint8, address, uint256, uint256));
            return _swapSell(key, seller, tokensIn, minOut);
        }
        if (operation == OP_COLLECT_FEES) return _collectPositionFees(key);
        revert BadConfig();
    }

    function _quoteCurveBuy(uint256 grossAvailable)
        private
        view
        returns (uint256 tokensOut, uint256 nativeUsed, uint256 fee, uint256 grossUsed)
    {
        if (grossAvailable == 0 || tokensSold >= curveTokenSupply || realNativeReserves >= graduationThreshold) {
            return (0, 0, 0, 0);
        }
        uint256 feeAtMax = FullMath.mulDiv(grossAvailable, FEE_BPS, BPS);
        uint256 netAvailable = grossAvailable - feeAtMax;
        uint256 quoteRemaining = graduationThreshold - realNativeReserves;

        if (netAvailable >= quoteRemaining) {
            tokensOut = curveTokenSupply - tokensSold;
            nativeUsed = quoteRemaining;
        } else {
            tokensOut = BondingCurveMath.tokensForQuote(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, netAvailable
            );
            if (tokensOut == 0) return (0, 0, 0, 0);
            nativeUsed = BondingCurveMath.quoteForTokens(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, tokensOut
            );
        }

        (grossUsed, fee) = _grossForNet(nativeUsed);
        while (grossUsed > grossAvailable && tokensOut > 0) {
            unchecked { --tokensOut; }
            if (tokensOut == 0) return (0, 0, 0, 0);
            nativeUsed = BondingCurveMath.quoteForTokens(
                graduationThreshold, curveTokenSupply, poolTokenAllocation, tokensSold, tokensOut
            );
            (grossUsed, fee) = _grossForNet(nativeUsed);
        }
    }

    function _grossForNet(uint256 netAmount) private pure returns (uint256 gross, uint256 fee) {
        if (netAmount == 0) return (0, 0);
        gross = FullMath.mulDivRoundingUp(netAmount, BPS, BPS - FEE_BPS);
        while (gross - FullMath.mulDiv(gross, FEE_BPS, BPS) < netAmount) ++gross;
        while (gross > 1 && gross - 1 - FullMath.mulDiv(gross - 1, FEE_BPS, BPS) >= netAmount) --gross;
        fee = gross - netAmount;
    }

    function _recordCurveFee(uint256 fee) private {
        if (fee == 0) return;
        uint256 creatorCut = FullMath.mulDiv(fee, CREATOR_FEE_SHARE_BPS, BPS);
        creatorFees += creatorCut;
        protocolFees += fee - creatorCut;
    }

    function _quoteV4Buy(uint256 nativeIn) private view returns (uint256 tokensOut, uint256 fee) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        (, , tokensOut, fee) = SwapMath.computeSwapStep(
            sqrtPriceX96, sqrtPriceLimitX96, liquidity, _negativeAmount(nativeIn), POOL_FEE
        );
        if (block.number < launchBlock + ANTI_SNIPE_BLOCKS) {
            uint256 earlyBuyCap = FullMath.mulDiv(totalSupply, MAX_BUY_BPS_ANTI_SNIPE, BPS);
            if (earlyTokensBought >= earlyBuyCap || tokensOut > earlyBuyCap - earlyTokensBought) return (0, 0);
        }
    }

    function _quoteV4Sell(uint256 tokensIn) private view returns (uint256 nativeOut, uint256 fee) {
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

    function _graduate() private {
        if (graduated || tokensSold < curveTokenSupply || realNativeReserves < graduationThreshold) {
            revert BadCurveAmount();
        }
        graduated = true;
        initialSqrtPriceX96 = _sqrtPriceForSeed(poolTokenAllocation, realNativeReserves);
        PoolKey memory key = _poolKey();
        poolId = key.toId();
        poolManager.initialize(key, initialSqrtPriceX96);

        uint256 nativeForPool = realNativeReserves;
        bytes memory result = _unlock(abi.encode(OP_ADD_LIQUIDITY, nativeForPool));
        (uint256 nativeUsed, uint256 tokenUsed, uint128 liquidity) =
            abi.decode(result, (uint256, uint256, uint128));
        initialLiquidity = liquidity;
        realNativeReserves = nativeUsed;

        uint256 tokenDust = token.balanceOf(address(this));
        if (tokenDust > 0 && !token.transfer(LP_BURN, tokenDust)) revert BadPoolDelta();
        uint256 expectedFees = creatorFees + protocolFees;
        uint256 balance = address(this).balance;
        if (balance > expectedFees) protocolFees += balance - expectedFees;

        emit V4PoolInitialized(
            address(token), PoolId.unwrap(poolId), initialSqrtPriceX96, nativeUsed, tokenUsed, liquidity
        );
        emit Graduated(address(token), nativeUsed, tokenUsed);
    }

    function _addInitialLiquidity(PoolKey memory key, uint256 nativeSeed) private returns (bytes memory) {
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 liquidity0 = _liquidityForAmount0(initialSqrtPriceX96, sqrtUpper, nativeSeed);
        uint256 liquidity1 = _liquidityForAmount1(sqrtLower, initialSqrtPriceX96, poolTokenAllocation);
        uint256 liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        if (liquidity == 0 || liquidity > type(uint128).max) revert InsufficientLiquidity();

        uint128 liquidityAmount = uint128(liquidity);
        for (uint256 i; i < 4; ++i) {
            uint256 nativeRequired = SqrtPriceMath.getAmount0Delta(initialSqrtPriceX96, sqrtUpper, liquidityAmount, true);
            uint256 tokenRequired = SqrtPriceMath.getAmount1Delta(sqrtLower, initialSqrtPriceX96, liquidityAmount, true);
            if (nativeRequired <= nativeSeed && tokenRequired <= poolTokenAllocation) break;
            if (liquidityAmount <= 1) revert BadPoolDelta();
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
        if (nativeDue > nativeSeed || tokenDue > poolTokenAllocation) revert BadPoolDelta();

        poolManager.sync(key.currency0);
        poolManager.settle{value: nativeDue}();
        poolManager.sync(key.currency1);
        if (!token.transfer(address(poolManager), tokenDue)) revert BadPoolDelta();
        poolManager.settle();
        return abi.encode(nativeDue, tokenDue, liquidityAmount);
    }

    function _swapBuy(PoolKey memory key, address buyer, uint256 nativeIn, uint256 minOut)
        private
        returns (bytes memory)
    {
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (liquidity == 0) revert InsufficientLiquidity();
        (uint160 sqrtBefore,,,) = poolManager.getSlot0(poolId);
        (uint160 sqrtPriceLimitX96,) = _sqrtPriceLimits();
        (,,, uint256 fee) = SwapMath.computeSwapStep(
            sqrtBefore, sqrtPriceLimitX96, liquidity, _negativeAmount(nativeIn), POOL_FEE
        );
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
        if (tokensOut < minOut) revert Slippage();

        poolManager.sync(key.currency0);
        poolManager.settle{value: nativeUsed}();
        poolManager.take(key.currency1, buyer, tokensOut);
        return abi.encode(tokensOut, nativeUsed, fee);
    }

    function _swapSell(PoolKey memory key, address seller, uint256 tokensIn, uint256 minOut)
        private
        returns (bytes memory)
    {
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (seller == address(0) || liquidity == 0) revert InsufficientLiquidity();
        (uint160 sqrtBefore,,,) = poolManager.getSlot0(poolId);
        (, uint160 sqrtPriceLimitX96) = _sqrtPriceLimits();
        (, , uint256 grossNativeOut,) = SwapMath.computeSwapStep(
            sqrtBefore, sqrtPriceLimitX96, liquidity, _negativeAmount(tokensIn), 0
        );
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({zeroForOne: false, amountSpecified: _negativeAmount(tokensIn), sqrtPriceLimitX96: sqrtPriceLimitX96}),
            ""
        );
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        if (delta0 > 0 || delta1 < 0) revert BadPoolDelta();
        uint256 nativeOut = uint256(uint128(-delta0));
        uint256 tokensUsed = uint256(uint128(delta1));
        if (nativeOut < minOut) revert Slippage();

        poolManager.sync(key.currency1);
        if (!token.transfer(address(poolManager), tokensUsed)) revert BadPoolDelta();
        poolManager.settle();
        poolManager.take(key.currency0, address(this), nativeOut);
        uint256 feeNative = grossNativeOut > nativeOut ? grossNativeOut - nativeOut : 0;
        return abi.encode(nativeOut, tokensUsed, feeNative);
    }

    function _collectV4Fees() private {
        if (!graduated) return;
        bytes memory result = _unlock(abi.encode(OP_COLLECT_FEES));
        (uint256 nativeFees, uint256 tokenFees) = abi.decode(result, (uint256, uint256));
        uint256 creatorCut = FullMath.mulDiv(nativeFees, CREATOR_FEE_SHARE_BPS, BPS);
        creatorFees += creatorCut;
        protocolFees += nativeFees - creatorCut;
        if (tokenFees > 0 && !token.transfer(creatorFeeRecipient, tokenFees)) revert BadPoolDelta();
        emit V4FeesCollected(creatorCut, nativeFees - creatorCut, tokenFees);
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
        if (_unlockActive) revert BadConfig();
        _unlockActive = true;
        _expectedOperation = abi.decode(data, (uint8));
        result = poolManager.unlock(data);
        _expectedOperation = 0;
        _unlockActive = false;
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
            revert BadConfig();
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
