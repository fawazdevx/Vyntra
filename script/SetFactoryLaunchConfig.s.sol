// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";

/// @notice Owner-only: raise graduation threshold and disable auto-migrate for new launches.
///
///   FACTORY_ADDRESS=0x292DDf3D31CCeE837915de4585965441BBD77395 \
///   GRADUATION_THRESHOLD=100000000000000000000 \
///   BDEX_ROUTER=0x0000000000000000000000000000000000000000 \
///   forge script script/SetFactoryLaunchConfig.s.sol:SetFactoryLaunchConfig \
///     --rpc-url $BOT_TESTNET_RPC_URL --chain-id 968 \
///     --account deploytestKey --sender $OWNER_ADDRESS \
///     --broadcast --slow -vvv
contract SetFactoryLaunchConfig is Script {
    function run() external {
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        uint256 threshold = vm.envOr("GRADUATION_THRESHOLD", uint256(100 ether));
        // Default: disable router so new curves never auto-migrate. Pass a router to re-enable optional migrateToBdex.
        address router = vm.envOr("BDEX_ROUTER", address(0));

        VyntraFactory factory = VyntraFactory(factoryAddr);
        console2.log("Factory", factoryAddr);
        console2.log("Owner", factory.owner());
        console2.log("Sender", msg.sender);
        console2.log("New threshold (BOT wei)", threshold);
        console2.log("New BDEX router", router);

        vm.startBroadcast();
        factory.setGraduationThreshold(threshold);
        factory.setBdexRouter(router);
        vm.stopBroadcast();

        console2.log("Updated threshold", factory.graduationThreshold());
        console2.log("Updated router", factory.bdexRouter());
    }
}
