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

interface IKeeperSplitter {
    function buybackAccrued() external view returns (uint256);
    function liquidityAccrued() external view returns (uint256);
    function curve() external view returns (address);
    function buyAndBurnMeme(uint256 botAmount, uint256 minTokensOut) external;
    function injectLiquidity(uint256 botAmount) external;
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
        uint256 botClaimed,
        uint256 botDistributed,
        uint256 vyntraBurned
    );
    event TaxSweep(
        address indexed caller,
        uint256 splittersTouched,
        uint256 memeBuybackBot,
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
        returns (uint256 botClaimed, uint256 vyntraBurned)
    {
        if (curves.length > MAX_BATCH) revert BatchTooLarge();
        uint256 touched;
        for (uint256 i = 0; i < curves.length; i++) {
            address c = curves[i];
            if (c == address(0)) continue;
            try IKeeperCurve(c).protocolFees() returns (uint256 fees) {
                if (fees == 0) continue;
                uint256 before = address(feeRouter).balance;
                try IKeeperCurve(c).claimProtocolFees() {
                    uint256 got = address(feeRouter).balance - before;
                    botClaimed += got;
                    touched++;
                } catch (bytes memory reason) {
                    emit CurveSkipped(c, reason);
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
        if (vaultBal > 0) {
            vyntraBurned = buybackVault.buyAndBurn(vaultBal, minVyntraOut);
        }

        emit ProtocolSweep(msg.sender, touched, botClaimed, distributed, vyntraBurned);
    }

    /// @notice Run meme tax buyback-burn and LP inject for splitters (skips migrated curves).
    function sweepTax(address[] calldata splitters)
        external
        nonReentrant
        returns (uint256 memeBuybackBot, uint256 liquidityInjected)
    {
        if (splitters.length > MAX_BATCH) revert BatchTooLarge();
        uint256 touched;
        for (uint256 i = 0; i < splitters.length; i++) {
            address s = splitters[i];
            if (s == address(0)) continue;

            try this._sweepOneSplitter(s) returns (uint256 bb, uint256 liq) {
                if (bb > 0 || liq > 0) touched++;
                memeBuybackBot += bb;
                liquidityInjected += liq;
            } catch (bytes memory reason) {
                emit SplitterSkipped(s, reason);
            }
        }

        emit TaxSweep(msg.sender, touched, memeBuybackBot, liquidityInjected);
    }

    /// @dev External so the batch loop can try/catch per splitter.
    function _sweepOneSplitter(address s) external returns (uint256 memeBot, uint256 liqBot) {
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
            memeBot = bb;
        }

        uint256 liq = sp.liquidityAccrued();
        if (liq > 0) {
            sp.injectLiquidity(liq);
            liqBot = liq;
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
            uint256 botClaimed,
            uint256 vyntraBurned,
            uint256 memeBuybackBot,
            uint256 liquidityInjected
        )
    {
        // Re-enter via external self so each path keeps its nonReentrant scope clean.
        (botClaimed, vyntraBurned) = this.sweepProtocol(curves, minVyntraOut);
        (memeBuybackBot, liquidityInjected) = this.sweepTax(splitters);
    }
}
