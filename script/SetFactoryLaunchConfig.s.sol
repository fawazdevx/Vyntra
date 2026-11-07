// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";

/// @notice Owner-only: update the status-only graduation threshold for new launches.
///
///   FACTORY_ADDRESS=0x... \
///   GRADUATION_THRESHOLD=1000000000000000000000 \
///   forge script script/SetFactoryLaunchConfig.s.sol:SetFactoryLaunchConfig \
///     --rpc-url https://testnet-rpc.elysium.kinetiq.xyz --chain-id 99801 \
///     --account deploytestKey --sender $OWNER_ADDRESS \
///     --broadcast --slow -vvv
contract SetFactoryLaunchConfig is Script {
    function run() external {
        require(block.chainid == 99801, "WRONG_CHAIN: ELYSIUM_TESTNET");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        uint256 threshold = vm.envOr("GRADUATION_THRESHOLD", uint256(1_000 ether));
        VyntraFactory factory = VyntraFactory(payable(factoryAddr));
        console2.log("Factory", factoryAddr);
        console2.log("Owner", factory.owner());
        console2.log("Sender", msg.sender);
        console2.log("New threshold (HYPE wei)", threshold);
        console2.log("Permanent pool manager", factory.poolManager());

        vm.startBroadcast();
        factory.setGraduationThreshold(threshold);
        vm.stopBroadcast();

        console2.log("Updated threshold", factory.graduationThreshold());
    }
}
