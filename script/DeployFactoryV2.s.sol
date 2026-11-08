// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraMarketDeployer} from "../src/VyntraMarketDeployer.sol";
import {VyntraBoard} from "../src/VyntraBoard.sol";
import {VyntraPromotion} from "../src/VyntraPromotion.sol";

interface IVyntraPromotionSettings {
    function owner() external view returns (address);
    function feePerDay() external view returns (uint256);
}

/// @notice Deploys a creator-fee-recipient-capable factory using an existing Vyntra deployment's settings.
/// @dev After deployment, import old launch records in batches with VyntraFactory.importLaunches before
///      changing the frontend/indexer factory address. The old tokens and curves remain live.
contract DeployFactoryV2 is Script {
    function run() external {
        require(block.chainid == 99801, "WRONG_CHAIN: ELYSIUM_TESTNET");
        address previousAddress = vm.envAddress("EXISTING_FACTORY");
        address vyntraToken = vm.envAddress("EXISTING_VYNTRA_TOKEN");
        address previousPromotion = vm.envAddress("EXISTING_PROMOTION");
        require(previousAddress.code.length > 0, "EXISTING_FACTORY_HAS_NO_CODE");
        require(vyntraToken.code.length > 0, "EXISTING_VYNTRA_TOKEN_HAS_NO_CODE");
        require(previousPromotion.code.length > 0, "EXISTING_PROMOTION_HAS_NO_CODE");

        VyntraFactory previous = VyntraFactory(payable(previousAddress));
        address treasury = previous.protocolTreasury();
        uint256 threshold = previous.graduationThreshold();
        address poolManager = previous.poolManager();
        uint256 previousLaunchCount = previous.launchCount();
        address promotionOwner = IVyntraPromotionSettings(previousPromotion).owner();
        uint256 promotionFee = IVyntraPromotionSettings(previousPromotion).feePerDay();

        vm.startBroadcast();
        VyntraMarketDeployer marketDeployer = new VyntraMarketDeployer();
        VyntraFactory factory = new VyntraFactory(treasury, threshold, poolManager, address(marketDeployer));
        marketDeployer.setFactory(address(factory));
        VyntraBoard board = new VyntraBoard(address(factory));
        VyntraPromotion promotion = new VyntraPromotion(
            vyntraToken, address(factory), promotionOwner, promotionFee
        );
        vm.stopBroadcast();

        console2.log("Previous VyntraFactory", previousAddress);
        console2.log("Previous launches to import", previousLaunchCount);
        console2.log("Protocol treasury", treasury);
        console2.log("Creator launch threshold (HYPE wei)", threshold);
        console2.log("PoolManager", poolManager);
        console2.log("New VyntraFactory", address(factory));
        console2.log("New VyntraMarketDeployer", address(marketDeployer));
        console2.log("New VyntraBoard", address(board));
        console2.log("New VyntraPromotion", address(promotion));
        console2.log("Factory capability version", factory.creatorFeePayoutVersion());
    }
}
