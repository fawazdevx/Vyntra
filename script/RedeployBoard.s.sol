// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VyntraBoard} from "../src/VyntraBoard.sol";

/// @notice Redeploy VyntraBoard with PLATFORM_THREAD (launchId 0) for $VYNTRA replies.
///
///   FACTORY_ADDRESS=0x292DDf3D31CCeE837915de4585965441BBD77395 \
///   forge script script/RedeployBoard.s.sol:RedeployBoard \
///     --rpc-url $BOT_TESTNET_RPC_URL --chain-id 968 \
///     --account deploytestKey --sender $OWNER_ADDRESS \
///     --broadcast --slow -vvv
contract RedeployBoard is Script {
    function run() external {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        require(factory.code.length > 0, "FACTORY");

        console2.log("Deployer", msg.sender);
        console2.log("Factory", factory);

        vm.startBroadcast();
        VyntraBoard board = new VyntraBoard(factory);
        vm.stopBroadcast();

        console2.log("--- Redeployed ---");
        console2.log("VyntraBoard", address(board));
        console2.log("PLATFORM_THREAD", board.PLATFORM_THREAD());
        console2.log("Set frontend:");
        console2.log("  VITE_BOARD_ADDRESS=", address(board));
    }
}