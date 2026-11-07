// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VYNTRA} from "../src/VYNTRA.sol";
import {VyntraMarket} from "../src/VyntraMarket.sol";
import {VyntraBuybackVault} from "../src/VyntraBuybackVault.sol";
import {VyntraFeeRouter} from "../src/VyntraFeeRouter.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraMarketDeployer} from "../src/VyntraMarketDeployer.sol";
import {VyntraBoard} from "../src/VyntraBoard.sol";
import {VyntraKeeper} from "../src/VyntraKeeper.sol";
import {VyntraReserveTimelock} from "../src/VyntraReserveTimelock.sol";
import {VyntraReserveVault} from "../src/VyntraReserveVault.sol";
import {VyntraPromotion} from "../src/VyntraPromotion.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";

/// @notice Deploy Vyntra economy + factory to Kinetiq Elysium testnet.
///
/// Deploys: V4 PoolManager → VYNTRA → platform market → fee stack → VyntraFactory → VyntraBoard
///
/// Testnet:
///   GRADUATION_THRESHOLD=1000000000000000000000 \
///   NATIVE_SEED=5000000000000000000 \
///   VYNTRA_SEED=50000000000000000000000000 \
///   VYNTRA_RESERVE_SAFE=$OWNER_ADDRESS \
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url https://testnet-rpc.elysium.kinetiq.xyz \
///     --chain-id 99801 \
///     --account deploytestKey \
///     --sender $OWNER_ADDRESS \
///     --broadcast --slow \
///     -vvv
///
/// Deployer needs NATIVE_SEED plus gas. Confirm Elysium supports Cancun/EIP-1153 before broadcasting.
///
/// If VYNTRA lands but later txs fail (nonce race), do NOT --resume. Use FinishDeploy.s.sol
/// with EXISTING_VYNTRA=<vyntra address> instead — resume would approve/seed stale addresses.
contract Deploy is Script {
    function run() external {
        require(block.chainid == 99801, "WRONG_CHAIN: ELYSIUM_TESTNET");
        address opsTreasury = vm.envOr("TREASURY", msg.sender);
        uint256 threshold = vm.envOr("GRADUATION_THRESHOLD", uint256(1_000 ether));
        uint256 nativeSeed = vm.envOr("NATIVE_SEED", uint256(5 ether));
        uint256 vyntraSeed = vm.envOr("VYNTRA_SEED", uint256(50_000_000 ether));
        uint256 promotionFee = vm.envOr("VYNTRA_PROMOTION_FEE", uint256(250_000 ether));
        address reserveSafe = vm.envOr("VYNTRA_RESERVE_SAFE", opsTreasury);
        uint256 totalVyntraSupply = 1_000_000_000 ether;
        require(vyntraSeed == 50_000_000 ether, "VYNTRA_SEED_MUST_BE_50M");
        address protocolFeeOwner = address(0);

        console2.log("Deployer", msg.sender);
        console2.log("Ops treasury", opsTreasury);
        console2.log("Graduation status threshold (HYPE wei)", threshold);
        console2.log("Market HYPE seed", nativeSeed);
        console2.log("Market VYNTRA seed", vyntraSeed);
        console2.log("VYNTRA reserve Safe/proposer", reserveSafe);
        console2.log("VYNTRA promotion fee per day", promotionFee);
        console2.log("V4 protocol fee owner (renounced)", protocolFeeOwner);
        console2.log("Chain id", block.chainid);

        uint256 bal = msg.sender.balance;
        if (bal < nativeSeed + 0.5 ether) {
            console2.log("WARNING: deployer balance may be too low for seed+gas");
            console2.log("  balance", bal);
            console2.log("  need roughly", nativeSeed + 0.5 ether);
        }

        vm.startBroadcast();

        // Deploy a Vyntra-owned PoolManager from Uniswap v4 core. The zero owner permanently
        // disables protocol-fee governance; Vyntra pools use no hooks or mutable fee controller.
        PoolManager poolManager = new PoolManager(protocolFeeOwner);
        VyntraReserveTimelock reserveTimelock = new VyntraReserveTimelock(reserveSafe);

        VYNTRA vyntraToken = new VYNTRA(msg.sender);
        VyntraReserveVault reserveVault = new VyntraReserveVault(address(vyntraToken), address(reserveTimelock));
        VyntraMarket market = new VyntraMarket(address(vyntraToken), address(poolManager));
        VyntraBuybackVault vault = new VyntraBuybackVault(address(market), address(vyntraToken));
        VyntraFeeRouter router = new VyntraFeeRouter(address(vault), opsTreasury);
        market.setFeeRecipient(address(router));

        vyntraToken.approve(address(market), vyntraSeed);
        market.seed{value: nativeSeed}(vyntraSeed);

        uint256 reserveAmount = vyntraToken.balanceOf(msg.sender);
        require(reserveAmount == totalVyntraSupply - vyntraSeed, "UNEXPECTED_VYNTRA_RESERVE");
        require(vyntraToken.transfer(address(reserveVault), reserveAmount), "RESERVE_TRANSFER");

        VyntraMarketDeployer marketDeployer = new VyntraMarketDeployer();
        VyntraFactory factory =
            new VyntraFactory(address(router), threshold, address(poolManager), address(marketDeployer));
        marketDeployer.setFactory(address(factory));
        VyntraBoard board = new VyntraBoard(address(factory));
        VyntraKeeper keeper = new VyntraKeeper(address(router), address(vault));
        VyntraPromotion promotion = new VyntraPromotion(
            address(vyntraToken), address(factory), address(reserveTimelock), promotionFee
        );

        vm.stopBroadcast();

        console2.log("--- Deployed ---");
        console2.log("Vyntra Uniswap v4 PoolManager", address(poolManager));
        console2.log("VYNTRA", address(vyntraToken));
        console2.log("VYNTRA reserve balance", reserveAmount);
        console2.log("VyntraReserveTimelock", address(reserveTimelock));
        console2.log("VyntraReserveVault", address(reserveVault));
        console2.log("VyntraPromotion", address(promotion));
        console2.log("VyntraMarket", address(market));
        console2.log("VyntraBuybackVault", address(vault));
        console2.log("VyntraFeeRouter", address(router));
        console2.log("VyntraFactory", address(factory));
        console2.log("VyntraMarketDeployer", address(marketDeployer));
        console2.log("VyntraBoard", address(board));
        console2.log("VyntraKeeper", address(keeper));
        console2.log("Vyntra V4 pool fee", uint256(10_000));
        console2.log("Minimum launch HYPE liquidity", uint256(5 ether));
        console2.log("Maximum launch HYPE liquidity", uint256(100 ether));
        console2.log("Set frontend:");
        console2.log("  VITE_FACTORY_ADDRESS=", address(factory));
        console2.log("  VITE_VYNTRA_TOKEN=", address(vyntraToken));
        console2.log("  VITE_VYNTRA_MARKET=", address(market));
        console2.log("  VITE_VYNTRA_RESERVE_TIMELOCK=", address(reserveTimelock));
        console2.log("  VITE_VYNTRA_RESERVE_VAULT=", address(reserveVault));
        console2.log("  VITE_VYNTRA_PROMOTION=", address(promotion));
        console2.log("  VITE_BUYBACK_VAULT=", address(vault));
        console2.log("  VITE_FEE_ROUTER=", address(router));
        console2.log("  VITE_BOARD_ADDRESS=", address(board));
        console2.log("  VITE_KEEPER_ADDRESS=", address(keeper));
    }
}
