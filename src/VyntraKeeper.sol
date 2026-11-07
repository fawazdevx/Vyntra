// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VyntraFeeRouter} from "./VyntraFeeRouter.sol";
import {VyntraBuybackVault} from "./VyntraBuybackVault.sol";

interface IKeeperCurve {
    function protocolFees() external view returns (uint256);
    function claimProtocolFees() external;
    function migrated() external view returns (bool);
}

interface IKeeperBuybackVault {
    function maxBuybackAmount() external view returns (uint256);
    function canExecuteBuyback() external view returns (bool);
    function quoteBuyAndBurn(uint256 nativeIn) external view returns (uint256);
    function buyAndBurn(uint256 nativeIn, uint256 minVyntraOut) external returns (uint256);
}

interface IKeeperSplitter {
    function buybackAccrued() external view returns (uint256);
    function liquidityAccrued() external view returns (uint256);
    function curve() external view returns (address);
    function buyAndBurnMeme(uint256 nativeAmount, uint256 minTokensOut) external;
    function injectLiquidity(uint256 nativeAmount) external;
}

/// @title VyntraKeeper
/// @notice Permissionless batch runner for protocol fee → buyback-burn and meme tax buckets.
/// @dev Anyone can call. Individual curve/splitter failures are skipped so one bad market
///      does not halt the sweep.
contract VyntraKeeper is ReentrancyGuard {
    uint256 public constant MAX_BATCH = 50;

    VyntraFeeRouter public immutable feeRouter;
    VyntraBuybackVault public immutable buybackVault;

    event ProtocolSweep(
        address indexed caller,
        uint256 curvesTouched,
        uint256 nativeClaimed,
        uint256 nativeDistributed,
        uint256 vyntraBurned
    );
    event TaxSweep(
        address indexed caller,
        uint256 splittersTouched,
        uint256 memeBuybackNative,
        uint256 liquidityInjected
    );
    event CurveSkipped(address indexed curve, bytes reason);
    event SplitterSkipped(address indexed splitter, bytes reason);

    error BadConfig();
    error BatchTooLarge();
    error OnlySelf();

    constructor(address feeRouter_, address buybackVault_) {
        if (feeRouter_ == address(0) || buybackVault_ == address(0)) revert BadConfig();
        feeRouter = VyntraFeeRouter(payable(feeRouter_));
        buybackVault = VyntraBuybackVault(payable(buybackVault_));
    }

    /// @notice Claim protocol fees from curves → distribute router → buy & burn VYNTRA.
    /// @param curves Curve addresses to claim from (duplicates ok; zero fees skipped). Cap: MAX_BATCH.
    /// @param minVyntraOut Slippage floor for the vault buyback (0 allowed on testnet).
    function sweepProtocol(address[] calldata curves, uint256 minVyntraOut)
        external
        nonReentrant
        returns (uint256 nativeClaimed, uint256 vyntraBurned)
    {
        if (curves.length > MAX_BATCH) revert BatchTooLarge();
        uint256 touched;
        for (uint256 i = 0; i < curves.length; i++) {
            address c = curves[i];
            if (c == address(0)) continue;
            try this._claimCurveFees(c) returns (uint256 got) {
                if (got > 0) {
                    nativeClaimed += got;
                    touched++;
                }
            } catch (bytes memory reason) {
                emit CurveSkipped(c, reason);
            }
        }

        uint256 routerBal = address(feeRouter).balance;
        uint256 distributed;
        if (routerBal > 0) {
            feeRouter.distribute();
            distributed = routerBal;
        }

        uint256 vaultBal = address(buybackVault).balance;
        uint256 maxBuyback = buybackVault.maxBuybackAmount();
        if (vaultBal > 0 && maxBuyback > 0 && buybackVault.canExecuteBuyback()) {
            uint256 nativeIn = vaultBal < maxBuyback ? vaultBal : maxBuyback;
            IKeeperBuybackVault vault = IKeeperBuybackVault(address(buybackVault));
            // The VYNTRA market has its own opening-buy cap. Leave accrued HYPE in the vault
            // until a buy is quoteable instead of reverting the fee-collection sweep.
            uint256 quote = vault.quoteBuyAndBurn(nativeIn);
            if (quote > 0 && minVyntraOut <= quote) {
                vyntraBurned = vault.buyAndBurn(nativeIn, minVyntraOut);
            }
        }

        emit ProtocolSweep(msg.sender, touched, nativeClaimed, distributed, vyntraBurned);
    }

    /// @dev External self-call keeps one market's empty fee claim from halting the sweep.
    function _claimCurveFees(address curve) external returns (uint256 received) {
        if (msg.sender != address(this)) revert OnlySelf();
        uint256 beforeBalance = address(feeRouter).balance;
        IKeeperCurve(curve).claimProtocolFees();
        received = address(feeRouter).balance - beforeBalance;
    }

    /// @notice Run meme tax buyback-burn and LP inject for splitters (skips migrated curves).
    function sweepTax(address[] calldata splitters)
        external
        nonReentrant
        returns (uint256 memeBuybackNative, uint256 liquidityInjected)
    {
        if (splitters.length > MAX_BATCH) revert BatchTooLarge();
        uint256 touched;
        for (uint256 i = 0; i < splitters.length; i++) {
            address s = splitters[i];
            if (s == address(0)) continue;

            try this._sweepOneSplitter(s) returns (uint256 bb, uint256 liq) {
                if (bb > 0 || liq > 0) touched++;
                memeBuybackNative += bb;
                liquidityInjected += liq;
            } catch (bytes memory reason) {
                emit SplitterSkipped(s, reason);
            }
        }

        emit TaxSweep(msg.sender, touched, memeBuybackNative, liquidityInjected);
    }

    /// @dev External so the batch loop can try/catch per splitter.
    function _sweepOneSplitter(address s) external returns (uint256 memeNative, uint256 liqNative) {
        if (msg.sender != address(this)) revert OnlySelf();

        IKeeperSplitter sp = IKeeperSplitter(s);
        address curve = sp.curve();
        if (curve == address(0)) return (0, 0);

        // Migrated curves reject buy/inject — skip tax automation for those markets.
        try IKeeperCurve(curve).migrated() returns (bool isMigrated) {
            if (isMigrated) return (0, 0);
        } catch {
            return (0, 0);
        }

        uint256 bb = sp.buybackAccrued();
        if (bb > 0) {
            sp.buyAndBurnMeme(bb, 0);
            memeNative = bb;
        }

        uint256 liq = sp.liquidityAccrued();
        if (liq > 0) {
            sp.injectLiquidity(liq);
            liqNative = liq;
        }
    }

    /// @notice Convenience: protocol sweep then tax sweep in one tx.
    function sweepAll(
        address[] calldata curves,
        address[] calldata splitters,
        uint256 minVyntraOut
    )
        external
        returns (
            uint256 nativeClaimed,
            uint256 vyntraBurned,
            uint256 memeBuybackNative,
            uint256 liquidityInjected
        )
    {
        // Re-enter via external self so each path keeps its nonReentrant scope clean.
        (nativeClaimed, vyntraBurned) = this.sweepProtocol(curves, minVyntraOut);
        (memeBuybackNative, liquidityInjected) = this.sweepTax(splitters);
    }
}
