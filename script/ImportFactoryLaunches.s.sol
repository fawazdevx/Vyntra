// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";

/// @notice Copies existing Vyntra factory launch records into a newly deployed factory in batches.
contract ImportFactoryLaunches is Script {
    function run() external {
        require(block.chainid == 99801, "WRONG_CHAIN: ELYSIUM_TESTNET");
        address previousAddress = vm.envAddress("EXISTING_FACTORY");
        address newAddress = vm.envAddress("NEW_FACTORY");
        uint256 firstId = vm.envUint("IMPORT_FIRST_ID");
        uint256 lastId = vm.envUint("IMPORT_LAST_ID");

        vm.startBroadcast();
        VyntraFactory(payable(newAddress)).importLaunches(previousAddress, firstId, lastId);
        vm.stopBroadcast();

        console2.log("Imported launch IDs", firstId, lastId);
        console2.log("New factory launch count", VyntraFactory(payable(newAddress)).launchCount());
    }
}
