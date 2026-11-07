// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VYNTRA} from "../src/VYNTRA.sol";
import {VyntraMarket} from "../src/VyntraMarket.sol";
import {VyntraBuybackVault} from "../src/VyntraBuybackVault.sol";
import {VyntraFeeRouter} from "../src/VyntraFeeRouter.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraCurve} from "../src/VyntraCurve.sol";

contract VyntraBuybackTest is Test {
    address ops = makeAddr("ops");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    VYNTRA vyntraToken;
    VyntraMarket market;
    VyntraBuybackVault vault;
    VyntraFeeRouter router;
    VyntraFactory factory;

    address constant BURN = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(address(this), 100 ether);

        vyntraToken = new VYNTRA(address(this));
        market = new VyntraMarket(address(vyntraToken));
        vault = new VyntraBuybackVault(address(market), address(vyntraToken));
        router = new VyntraFeeRouter(address(vault), ops);
        factory = new VyntraFactory(address(router), 1 ether, address(0));

        // Seed VYNTRA/HYPE market: 10M VYNTRA + 10 HYPE
        uint256 seedVyntra = 10_000_000 ether;
        vyntraToken.approve(address(market), seedVyntra);
        market.seed{value: 10 ether}(seedVyntra);
    }

    function test_FeeRouterSplits80_20() public {
        vm.deal(address(router), 10 ether);
        uint256 opsBefore = ops.balance;
        uint256 vaultBefore = address(vault).balance;

        router.distribute();

        assertEq(ops.balance - opsBefore, 2 ether);
        assertEq(address(vault).balance - vaultBefore, 8 ether);
        assertEq(address(router).balance, 0);
    }

    function test_BuyAndBurn() public {
        vm.deal(address(vault), 1 ether);
        uint256 burnedBefore = vyntraToken.balanceOf(BURN);

        uint256 expected = vault.quoteBuyAndBurn(1 ether);
        assertGt(expected, 0);

        uint256 burned = vault.buyAndBurn(1 ether, expected);
        assertEq(burned, expected);
        assertEq(vyntraToken.balanceOf(BURN), burnedBefore + burned);
        assertEq(address(vault).balance, 0);
    }

    function test_ProtocolFeesFlowToBuyback() public {
        vm.prank(alice);
        (, address curve) =
            factory.spawn("Flow", "FLW", "ipfs://f", "flow desc", address(0), 0, 0, 0, 0, 0, 0);
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, address(0));

        uint256 protocolFees = VyntraCurve(payable(curve)).protocolFees();
        assertGt(protocolFees, 0);

        VyntraCurve(payable(curve)).claimProtocolFees();
        assertEq(address(router).balance, protocolFees);

        router.distribute();
        uint256 toBuyback = (protocolFees * 8_000) / 10_000;
        assertEq(address(vault).balance, toBuyback);

        uint256 burnedBefore = vyntraToken.balanceOf(BURN);
        vault.buyAndBurn(toBuyback, 0);
        assertGt(vyntraToken.balanceOf(BURN), burnedBefore);
    }

    function test_FactoryTreasuryIsRouter() public {
        vm.prank(alice);
        (, address curve) =
            factory.spawn("Treas", "TRS", "ipfs://t", "treasury check", address(0), 0, 0, 0, 0, 0, 0);
        assertEq(VyntraCurve(payable(curve)).protocolTreasury(), address(router));
    }
}
