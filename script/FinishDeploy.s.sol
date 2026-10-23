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

/// @notice Continue a partial Deploy after VYNTRA is already on-chain (nonce race).
///
/// Do NOT use `forge script --resume` on the broken broadcast — approve/seed
/// would target stale simulated addresses.
///
///   EXISTING_VYNTRA=0x… BOT_SEED=2000000000000000000 \
///   forge script script/FinishDeploy.s.sol:FinishDeploy \
///     --rpc-url $BOT_TESTNET_RPC_URL \
///     --chain-id 968 \
///     --account deploytestKey \
///     --sender $OWNER_ADDRESS \
///     --broadcast --slow \
///     -vvv
contract FinishDeploy is Script {
    function run() external {
        address vyntraAddr = vm.envAddress("EXISTING_VYNTRA");
        address opsTreasury = vm.envOr("TREASURY", msg.sender);
        uint256 threshold = vm.envOr("GRADUATION_THRESHOLD", uint256(1 ether));
        uint256 botSeed = vm.envOr("BOT_SEED", uint256(2 ether));
        uint256 vyntraSeed = vm.envOr("VYNTRA_SEED", uint256(50_000_000 ether));
        address bdexRouter = vm.envOr("BDEX_ROUTER", _defaultBdexRouter(block.chainid));

        VYNTRA vyntraToken = VYNTRA(vyntraAddr);
        require(address(vyntraToken).code.length > 0, "VYNTRA has no code");
        require(vyntraToken.balanceOf(msg.sender) >= vyntraSeed, "insufficient VYNTRA for seed");

        console2.log("Deployer", msg.sender);
        console2.log("Existing VYNTRA", vyntraAddr);
        console2.log("Ops treasury", opsTreasury);
        console2.log("Market BOT seed", botSeed);
        console2.log("Market VYNTRA seed", vyntraSeed);
        console2.log("Deployer BOT balance", msg.sender.balance);

        if (msg.sender.balance < botSeed + 0.15 ether) {
            console2.log("WARNING: balance may be too low for seed+gas");
        }

        vm.startBroadcast();

        VyntraMarket market = new VyntraMarket(vyntraAddr);
        VyntraBuybackVault vault = new VyntraBuybackVault(address(market), vyntraAddr);
        VyntraFeeRouter router = new VyntraFeeRouter(address(vault), opsTreasury);

        vyntraToken.approve(address(market), vyntraSeed);
        market.seed{value: botSeed}(vyntraSeed);

        VyntraFactory factory = new VyntraFactory(address(router), threshold, bdexRouter);
        VyntraBoard board = new VyntraBoard(address(factory));
        VyntraKeeper keeper = new VyntraKeeper(address(router), address(vault));

        vm.stopBroadcast();

        console2.log("--- Finished ---");
        console2.log("VYNTRA", vyntraAddr);
        console2.log("VyntraMarket", address(market));
        console2.log("VyntraBuybackVault", address(vault));
        console2.log("VyntraFeeRouter", address(router));
        console2.log("VyntraFactory", address(factory));
        console2.log("VyntraBoard", address(board));
        console2.log("VyntraKeeper", address(keeper));
        console2.log("BDEX Router", bdexRouter);
        console2.log("Set frontend:");
        console2.log("  VITE_FACTORY_ADDRESS=", address(factory));
        console2.log("  VITE_VYNTRA_TOKEN=", vyntraAddr);
        console2.log("  VITE_VYNTRA_MARKET=", address(market));
        console2.log("  VITE_BUYBACK_VAULT=", address(vault));
        console2.log("  VITE_FEE_ROUTER=", address(router));
        console2.log("  VITE_BOARD_ADDRESS=", address(board));
        console2.log("  VITE_KEEPER_ADDRESS=", address(keeper));
    }

    function _defaultBdexRouter(uint256 chainId) internal pure returns (address) {
        if (chainId == 968) return 0xD6425a02f0845B8D99e349C34D2E7A576E177345;
        if (chainId == 677) return 0x1414eD29FdFD322c3c0a830330ed982E2D629e76;
        return address(0);
    }
}
