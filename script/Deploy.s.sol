// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VYNTRA} from "../src/VYNTRA.sol";
import {VyntraMarket} from "../src/VyntraMarket.sol";
import {VyntraBuybackVault} from "../src/VyntraBuybackVault.sol";
import {VyntraFeeRouter} from "../src/VyntraFeeRouter.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraBoard} from "../src/VyntraBoard.sol";
import {VyntraKeeper} from "../src/VyntraKeeper.sol";

/// @notice Deploy Vyntra economy + factory to BOT Chain testnet or mainnet.
///
/// Deploys: VYNTRA → VyntraMarket (seeded) → BuybackVault → FeeRouter → VyntraFactory → VyntraBoard
///
/// Testnet (use --slow on flaky RPCs to avoid nonce races):
///   BOT_SEED=2000000000000000000 forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $BOT_TESTNET_RPC_URL \
///     --chain-id $BOT_TESTNET_CHAIN_ID \
///     --account deploytestKey \
///     --sender $OWNER_ADDRESS \
///     --broadcast --slow \
///     -vvv
///
/// Deployer needs BOT_SEED + ~0.2 BOT gas. Default seed is 5 BOT — lower BOT_SEED if underfunded.
///
/// If VYNTRA lands but later txs fail (nonce race), do NOT --resume. Use FinishDeploy.s.sol
/// with EXISTING_VYNTRA=<vyntra address> instead — resume would approve/seed stale addresses.
contract Deploy is Script {
    function run() external {
        address opsTreasury = vm.envOr("TREASURY", msg.sender);
        uint256 threshold = vm.envOr("GRADUATION_THRESHOLD", uint256(1 ether));
        // Seed VYNTRA/BOT market for buybacks
        uint256 botSeed = vm.envOr("BOT_SEED", uint256(5 ether));
        uint256 vyntraSeed = vm.envOr("VYNTRA_SEED", uint256(50_000_000 ether));
        address bdexRouter = vm.envOr("BDEX_ROUTER", _defaultBdexRouter(block.chainid));

        console2.log("Deployer", msg.sender);
        console2.log("Ops treasury", opsTreasury);
        console2.log("Graduation threshold (wei)", threshold);
        console2.log("Market BOT seed", botSeed);
        console2.log("Market VYNTRA seed", vyntraSeed);
        console2.log("BDEX router", bdexRouter);
        console2.log("Chain id", block.chainid);

        uint256 bal = msg.sender.balance;
        if (bal < botSeed + 0.15 ether) {
            console2.log("WARNING: deployer balance may be too low for seed+gas");
            console2.log("  balance", bal);
            console2.log("  need roughly", botSeed + 0.15 ether);
        }

        vm.startBroadcast();

        VYNTRA vyntraToken = new VYNTRA(msg.sender);
        VyntraMarket market = new VyntraMarket(address(vyntraToken));
        VyntraBuybackVault vault = new VyntraBuybackVault(address(market), address(vyntraToken));
        VyntraFeeRouter router = new VyntraFeeRouter(address(vault), opsTreasury);

        vyntraToken.approve(address(market), vyntraSeed);
        market.seed{value: botSeed}(vyntraSeed);

        VyntraFactory factory = new VyntraFactory(address(router), threshold, bdexRouter);
        VyntraBoard board = new VyntraBoard(address(factory));
        VyntraKeeper keeper = new VyntraKeeper(address(router), address(vault));

        vm.stopBroadcast();

        console2.log("--- Deployed ---");
        console2.log("VYNTRA", address(vyntraToken));
        console2.log("VyntraMarket", address(market));
        console2.log("VyntraBuybackVault", address(vault));
        console2.log("VyntraFeeRouter", address(router));
        console2.log("VyntraFactory", address(factory));
        console2.log("VyntraBoard", address(board));
        console2.log("VyntraKeeper", address(keeper));
        console2.log("BDEX Router", bdexRouter);
        console2.log("Set frontend:");
        console2.log("  VITE_FACTORY_ADDRESS=", address(factory));
        console2.log("  VITE_VYNTRA_TOKEN=", address(vyntraToken));
        console2.log("  VITE_VYNTRA_MARKET=", address(market));
        console2.log("  VITE_BUYBACK_VAULT=", address(vault));
        console2.log("  VITE_FEE_ROUTER=", address(router));
        console2.log("  VITE_BOARD_ADDRESS=", address(board));
        console2.log("  VITE_KEEPER_ADDRESS=", address(keeper));
    }

    function _defaultBdexRouter(uint256 chainId) internal pure returns (address) {
        // https://dev-docs.botchain.ai/docs/DEX/contract-addresses/
        if (chainId == 968) return 0xD6425a02f0845B8D99e349C34D2E7A576E177345; // testnet V2 Router02
        if (chainId == 677) return 0x1414eD29FdFD322c3c0a830330ed982E2D629e76; // mainnet V2 Router02
        return address(0);
    }
}
