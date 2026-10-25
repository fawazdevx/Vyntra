// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VyntraToken} from "./VyntraToken.sol";
import {VyntraRevenueSplitter} from "./VyntraRevenueSplitter.sol";
import {IUniswapV2Router02, IUniswapV2Factory} from "./interfaces/IUniswapV2.sol";

/// @title VyntraCurve
/// @notice Constant-product launch curve. Graduation is a status flag; trading stays on-curve
///         (Uniswap V2-style) when a router is configured; LP is burned/locked.
///         If no router is set, trading continues on this locked AMM.
///         Optional Argus meme tax is taken after the 1.25% protocol fee and sent to the splitter.
contract VyntraCurve is ReentrancyGuard {
    uint256 public constant FEE_BPS = 125; // 1.25%
    uint256 public constant BPS = 10_000;
    uint256 public constant CREATOR_FEE_SHARE_BPS = 5_000; // 50% of fee
    uint256 public constant REFERRER_FEE_SHARE_BPS = 1_000; // 10% of fee

    uint256 public constant ANTI_SNIPE_BLOCKS = 3;
    uint256 public constant MAX_BUY_BPS_ANTI_SNIPE = 200; // 2% of total supply
    address public constant LP_BURN = 0x000000000000000000000000000000000000dEaD;

    VyntraToken public immutable token;
    address public immutable creator;
    address public immutable protocolTreasury;
    address public immutable factory;
    address public immutable splitter;
    /// @dev BDEX V2 Router02 (or address(0) to keep internal AMM after graduation).
    address public immutable bdexRouter;

    uint256 public immutable virtualBotReserves;
    uint256 public immutable virtualTokenReserves;
    uint256 public immutable realTokenReserves; // tokens sold during bonding phase
    uint256 public immutable graduationThreshold;
    uint256 public immutable launchBlock;
    uint256 public immutable totalSupply;

    uint256 public realBotReserves;
    uint256 public tokensSold;
    bool public graduated;
    bool public migrated;
    address public externalPair;

    uint256 public creatorFees;
    uint256 public protocolFees;
    mapping(address => uint256) public referrerFees;

    event Buy(
        address indexed buyer,
        address indexed referrer,
        uint256 botIn,
        uint256 tokensOut,
        uint256 fee
    );
    event Sell(address indexed seller, uint256 tokensIn, uint256 botOut, uint256 fee);
    event TaxCollected(address indexed trader, bool isBuy, uint256 memeTax);
    event Graduated(address indexed token, uint256 botLiquidity, uint256 tokenLiquidity);
    event MigratedToBdex(
        address indexed token,
        address indexed pair,
        uint256 botAmount,
        uint256 tokenAmount,
        uint256 liquidity
    );
    event FeesClaimed(address indexed account, uint256 amount);
    event LiquidityInjected(uint256 amount);

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
    error OnlySelf();
    error NothingToClaim();
    error BadConfig();

    constructor(
        address token_,
        address creator_,
        address protocolTreasury_,
        address factory_,
        uint256 virtualBotReserves_,
        uint256 virtualTokenReserves_,
        uint256 realTokenReserves_,
        uint256 graduationThreshold_,
        uint256 totalSupply_,
        address splitter_,
        address bdexRouter_
    ) {
        if (
            token_ == address(0) || creator_ == address(0) || protocolTreasury_ == address(0)
                || factory_ == address(0) || splitter_ == address(0)
        ) {
            revert BadConfig();
        }
        token = VyntraToken(token_);
        creator = creator_;
        protocolTreasury = protocolTreasury_;
        factory = factory_;
        splitter = splitter_;
        bdexRouter = bdexRouter_; // may be address(0) to disable BDEX migrate
        virtualBotReserves = virtualBotReserves_;
        virtualTokenReserves = virtualTokenReserves_;
        realTokenReserves = realTokenReserves_;
        graduationThreshold = graduationThreshold_;
        totalSupply = totalSupply_;
        launchBlock = block.number;
    }

    receive() external payable {}

    function buyTaxBps() public view returns (uint256) {
        return VyntraRevenueSplitter(payable(splitter)).buyTaxBps();
    }

    function sellTaxBps() public view returns (uint256) {
        return VyntraRevenueSplitter(payable(splitter)).sellTaxBps();
    }

    function getReserves() public view returns (uint256 botReserves, uint256 tokenReserves) {
        botReserves = virtualBotReserves + realBotReserves;
        tokenReserves = virtualTokenReserves - tokensSold;
    }

    function getProgressBps() public view returns (uint256) {
        if (graduationThreshold == 0) return 0;
        uint256 p = (realBotReserves * BPS) / graduationThreshold;
        return p > BPS ? BPS : p;
    }

    /// @notice "bonding" → "amm" (internal) → "bdex" after successful external migrate.
    function tradeVenue() external view returns (string memory) {
        if (migrated) return "bdex";
        return graduated ? "amm" : "bonding";
    }

    /// @notice Returns tokensOut and protocolFee. Meme tax (if any) is applied after protocol fee
    ///         so quoted tokensOut matches execution.
    function quoteBuy(uint256 botIn) public view returns (uint256 tokensOut, uint256 fee) {
        if (botIn == 0) return (0, 0);
        fee = (botIn * FEE_BPS) / BPS;
        uint256 afterProtocol = botIn - fee;
        uint256 taxBps = buyTaxBps();
        uint256 memeTax = taxBps > 0 ? (afterProtocol * taxBps) / BPS : 0;
        uint256 botToPool = afterProtocol - memeTax;

        (uint256 botR, uint256 tokR) = getReserves();
        if (botR == 0 || tokR <= 1 || botToPool == 0) return (0, fee);

        tokensOut = (botToPool * tokR) / (botR + botToPool);
        // Never empty the virtual pool
        if (tokensOut >= tokR) tokensOut = tokR - 1;

        if (!graduated) {
            uint256 remaining = realTokenReserves - tokensSold;
            if (tokensOut > remaining) tokensOut = remaining;
        }
    }

    function quoteBuyDetailed(uint256 botIn)
        public
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 memeTax)
    {
        if (botIn == 0) return (0, 0, 0);
        protocolFee = (botIn * FEE_BPS) / BPS;
        uint256 afterProtocol = botIn - protocolFee;
        uint256 taxBps = buyTaxBps();
        memeTax = taxBps > 0 ? (afterProtocol * taxBps) / BPS : 0;
        (tokensOut,) = quoteBuy(botIn);
    }

    function quoteSell(uint256 tokensIn) public view returns (uint256 botOut, uint256 fee) {
        if (tokensIn == 0) return (0, 0);
        (uint256 botR, uint256 tokR) = getReserves();
        if (tokR == 0 || botR == 0) return (0, 0);

        uint256 botGross = (tokensIn * botR) / (tokR + tokensIn);
        if (botGross > realBotReserves) botGross = realBotReserves;
        fee = (botGross * FEE_BPS) / BPS;
        uint256 afterProtocol = botGross - fee;
        uint256 taxBps = sellTaxBps();
        uint256 memeTax = taxBps > 0 ? (afterProtocol * taxBps) / BPS : 0;
        botOut = afterProtocol - memeTax;
    }

    function quoteSellDetailed(uint256 tokensIn)
        public
        view
        returns (uint256 botOut, uint256 protocolFee, uint256 memeTax)
    {
        if (tokensIn == 0) return (0, 0, 0);
        (uint256 botR, uint256 tokR) = getReserves();
        if (tokR == 0 || botR == 0) return (0, 0, 0);

        uint256 botGross = (tokensIn * botR) / (tokR + tokensIn);
        if (botGross > realBotReserves) botGross = realBotReserves;
        protocolFee = (botGross * FEE_BPS) / BPS;
        uint256 afterProtocol = botGross - protocolFee;
        uint256 taxBps = sellTaxBps();
        memeTax = taxBps > 0 ? (afterProtocol * taxBps) / BPS : 0;
        botOut = afterProtocol - memeTax;
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
        if (migrated) revert Migrated();
        if (msg.value == 0) revert ZeroAmount();

        uint256 protocolFee = (msg.value * FEE_BPS) / BPS;
        uint256 afterProtocol = msg.value - protocolFee;
        uint256 taxBps = buyTaxBps();
        uint256 memeTax = taxBps > 0 ? (afterProtocol * taxBps) / BPS : 0;
        uint256 botToPool = afterProtocol - memeTax;

        (tokensOut,) = quoteBuy(msg.value);
        if (tokensOut < minTokensOut) revert Slippage();
        if (tokensOut == 0) revert InsufficientLiquidity();

        // Anti-snipe only during early bonding blocks
        if (!graduated) {
            _enforceAntiSnipe(beneficiary, tokensOut);
        }

        _splitFees(protocolFee, referrer, beneficiary);

        // Effects before interactions (tax splitter / token transfer / possible migrate).
        tokensSold += tokensOut;
        realBotReserves += botToPool;

        if (memeTax > 0) {
            VyntraRevenueSplitter(payable(splitter)).receiveTax{value: memeTax}();
            emit TaxCollected(beneficiary, true, memeTax);
        }

        bool ok = token.transfer(beneficiary, tokensOut);
        require(ok, "TRANSFER");

        emit Buy(beneficiary, referrer, msg.value, tokensOut, protocolFee);

        if (!graduated && realBotReserves >= graduationThreshold) {
            _graduate();
        }
    }

    function sell(uint256 tokensIn, uint256 minBotOut) external nonReentrant returns (uint256 botOut) {
        if (migrated) revert Migrated();
        if (tokensIn == 0) revert ZeroAmount();

        uint256 protocolFee;
        uint256 memeTax;
        (botOut, protocolFee, memeTax) = quoteSellDetailed(tokensIn);
        if (botOut < minBotOut) revert Slippage();
        if (botOut == 0) revert InsufficientLiquidity();

        bool ok = token.transferFrom(msg.sender, address(this), tokensIn);
        require(ok, "TRANSFER_FROM");

        // Effects before tax / ETH send.
        tokensSold -= tokensIn;
        realBotReserves -= (botOut + protocolFee + memeTax);
        _splitFees(protocolFee, address(0), msg.sender);

        if (memeTax > 0) {
            VyntraRevenueSplitter(payable(splitter)).receiveTax{value: memeTax}();
            emit TaxCollected(msg.sender, false, memeTax);
        }

        (bool sent,) = payable(msg.sender).call{value: botOut}("");
        require(sent, "BOT_SEND");

        emit Sell(msg.sender, tokensIn, botOut, protocolFee);
    }

    /// @notice Splitter-only: add BOT to real reserves (liquidity tax bucket).
    function injectBotLiquidity() external payable nonReentrant {
        if (migrated) revert Migrated();
        if (msg.sender != splitter) revert NotSplitter();
        if (msg.value == 0) revert ZeroAmount();
        realBotReserves += msg.value;
        emit LiquidityInjected(msg.value);
    }

    /// @notice Permissionless: migrate graduated curve liquidity to BDEX V2 and lock LP.
    /// @dev Optional. Closes curve buy/sell. Prefer leaving liquidity on Vyntra; users import the token on BDEX (mainnet) if they want an external market.
    function migrateToBdex() external nonReentrant {
        if (!graduated) revert NotGraduated();
        if (migrated) revert AlreadyMigrated();
        if (bdexRouter == address(0)) revert NoRouter();
        _migrateToBdex();
        if (!migrated) revert MigrateFailed();
    }

    function claimCreatorFees() external nonReentrant {
        uint256 amount = creatorFees;
        if (amount == 0) revert NothingToClaim();
        creatorFees = 0;
        (bool sent,) = payable(creator).call{value: amount}("");
        require(sent, "SEND");
        emit FeesClaimed(creator, amount);
    }

    function claimProtocolFees() external nonReentrant {
        uint256 amount = protocolFees;
        if (amount == 0) revert NothingToClaim();
        protocolFees = 0;
        (bool sent,) = payable(protocolTreasury).call{value: amount}("");
        require(sent, "SEND");
        emit FeesClaimed(protocolTreasury, amount);
    }

    function claimReferrerFees(address referrer) external nonReentrant {
        if (referrer == address(0)) revert NothingToClaim();
        uint256 amount = referrerFees[referrer];
        if (amount == 0) revert NothingToClaim();
        referrerFees[referrer] = 0;
        (bool sent,) = payable(referrer).call{value: amount}("");
        require(sent, "SEND");
        emit FeesClaimed(referrer, amount);
    }

    function _enforceAntiSnipe(address beneficiary, uint256 tokensOut) internal view {
        uint256 blocksSince = block.number - launchBlock;
        if (blocksSince == 0) {
            if (beneficiary != creator) revert AntiSnipe();
            return;
        }
        if (blocksSince <= ANTI_SNIPE_BLOCKS) {
            uint256 maxBuy = (totalSupply * MAX_BUY_BPS_ANTI_SNIPE) / BPS;
            if (tokensOut > maxBuy) revert AntiSnipe();
        }
    }

    function _splitFees(uint256 fee, address referrer, address trader) internal {
        if (fee == 0) return;
        uint256 creatorCut = (fee * CREATOR_FEE_SHARE_BPS) / BPS;
        uint256 referrerCut;
        if (referrer != address(0) && referrer != trader && referrer != creator) {
            referrerCut = (fee * REFERRER_FEE_SHARE_BPS) / BPS;
            referrerFees[referrer] += referrerCut;
        }
        uint256 protocolCut = fee - creatorCut - referrerCut;
        creatorFees += creatorCut;
        protocolFees += protocolCut;
    }

    /// @dev Graduation milestone only. Trading stays on this curve (Argus-style).
    ///      Optional `migrateToBdex()` remains permissionless for mainnet LP lockouts — it closes the curve.
    function _graduate() internal {
        if (graduated) return;
        graduated = true;
        uint256 tokenLiquidity = totalSupply - tokensSold;
        emit Graduated(address(token), realBotReserves, tokenLiquidity);
    }

    /// @dev External wrapper so `_graduate` can try/catch migration without bubbling reverts.
    function migrateToBdexExternal() external {
        if (msg.sender != address(this)) revert OnlySelf();
        if (!graduated || migrated || bdexRouter == address(0)) return;
        _migrateToBdex();
    }

    function _migrateToBdex() internal {
        uint256 botAmount = realBotReserves;
        uint256 tokenAmount = token.balanceOf(address(this));
        if (botAmount == 0 || tokenAmount == 0) revert InsufficientLiquidity();
        // Fee accruals stay on the contract; only pool BOT migrates.
        if (address(this).balance < botAmount) revert InsufficientLiquidity();

        IUniswapV2Router02 router = IUniswapV2Router02(bdexRouter);
        address weth = router.WETH();

        require(IERC20(address(token)).approve(bdexRouter, tokenAmount), "APPROVE");

        (uint256 usedToken, uint256 usedBot, uint256 liquidity) = router.addLiquidityETH{value: botAmount}(
            address(token),
            tokenAmount,
            0,
            0,
            LP_BURN,
            block.timestamp
        );

        // Clear any leftover allowance so a compromised/future router cannot pull residual tokens.
        require(IERC20(address(token)).approve(bdexRouter, 0), "APPROVE_CLEAR");

        address pair = IUniswapV2Factory(router.factory()).getPair(address(token), weth);
        if (pair == address(0)) revert MigrateFailed();

        realBotReserves = 0;
        migrated = true;
        externalPair = pair;

        emit MigratedToBdex(address(token), pair, usedBot, usedToken, liquidity);
    }

    /// @notice ETH held for fee claims (not part of the tradable pool).
    function accruedFees() public view returns (uint256) {
        return creatorFees + protocolFees;
    }
}
