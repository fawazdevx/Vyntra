// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraCurve} from "../src/VyntraCurve.sol";
import {VyntraRevenueSplitter} from "../src/VyntraRevenueSplitter.sol";
import {VyntraToken} from "../src/VyntraToken.sol";
import {VyntraKeeper} from "../src/VyntraKeeper.sol";
import {VyntraFeeRouter} from "../src/VyntraFeeRouter.sol";
import {VyntraBuybackVault} from "../src/VyntraBuybackVault.sol";
import {VyntraMarket} from "../src/VyntraMarket.sol";
import {VYNTRA} from "../src/VYNTRA.sol";
import {MockUniswapV2Router} from "./mocks/MockUniswapV2Router.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Security-focused fuzz + invariant-style checks for fee/tax/migrate hardening.
contract VyntraSecurityTest is Test {
    VyntraFactory factory;
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address referrer = makeAddr("referrer");

    uint256 constant FEE_BPS = 125;
    uint256 constant BPS = 10_000;

    function setUp() public {
        factory = new VyntraFactory(treasury, 1 ether, address(0));
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(referrer, 1 ether);
    }

    function _spawn() internal returns (address token, address curve) {
        vm.prank(alice);
        return factory.spawn("Sec", "SEC", "ipfs://s", "security", address(0), 0, 0, 0, 0, 0, 0);
    }

    function testFuzz_FeeSplitSumsToFee(uint96 nativeInRaw) public {
        uint256 nativeIn = bound(uint256(nativeInRaw), 0.001 ether, 50 ether);
        (, address curve) = _spawn();
        vm.roll(block.number + 4);

        uint256 expectedFee = (nativeIn * FEE_BPS) / BPS;
        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: nativeIn}(0, referrer);

        uint256 creator = VyntraCurve(payable(curve)).creatorFees();
        uint256 protocol = VyntraCurve(payable(curve)).protocolFees();
        uint256 ref = VyntraCurve(payable(curve)).referrerFees(referrer);
        assertEq(creator + protocol + ref, expectedFee);
        assertEq(creator, (expectedFee * 5_000) / BPS);
        assertEq(ref, (expectedFee * 1_000) / BPS);
    }

    function testFuzz_QuoteBuyMatchesExecution(uint96 nativeInRaw) public {
        uint256 nativeIn = bound(uint256(nativeInRaw), 0.001 ether, 20 ether);
        (address token, address curve) = _spawn();
        vm.roll(block.number + 4);

        (uint256 quoted,) = VyntraCurve(payable(curve)).quoteBuy(nativeIn);
        uint256 before = VyntraToken(token).balanceOf(bob);
        vm.prank(bob);
        uint256 out = VyntraCurve(payable(curve)).buy{value: nativeIn}(0, address(0));
        assertEq(out, quoted);
        assertEq(VyntraToken(token).balanceOf(bob), before + out);
    }

    function testFuzz_PoolSolvencyAfterTrade(uint96 nativeInRaw) public {
        uint256 nativeIn = bound(uint256(nativeInRaw), 0.01 ether, 30 ether);
        (, address curve) = _spawn();
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: nativeIn}(0, referrer);

        uint256 bal = address(curve).balance;
        uint256 reserved = VyntraCurve(payable(curve)).realNativeReserves()
            + VyntraCurve(payable(curve)).creatorFees()
            + VyntraCurve(payable(curve)).protocolFees()
            + VyntraCurve(payable(curve)).referrerFees(referrer);
        assertGe(bal, reserved);
    }

    function test_ClaimRevertsWhenEmpty() public {
        (, address curve) = _spawn();
        vm.expectRevert(VyntraCurve.NothingToClaim.selector);
        VyntraCurve(payable(curve)).claimCreatorFees();
        vm.expectRevert(VyntraCurve.NothingToClaim.selector);
        VyntraCurve(payable(curve)).claimProtocolFees();
        vm.expectRevert(VyntraCurve.NothingToClaim.selector);
        VyntraCurve(payable(curve)).claimReferrerFees(referrer);
    }

    function test_OwnerRejectsZeroAddress() public {
        vm.expectRevert(VyntraFactory.ZeroAddress.selector);
        factory.setProtocolTreasury(address(0));
        vm.expectRevert(VyntraFactory.ZeroAddress.selector);
        factory.transferOwnership(address(0));
    }

    function test_MigrateClearsAllowanceAndBlocksTrading() public {
        MockUniswapV2Router uniswap = new MockUniswapV2Router();
        VyntraFactory f = new VyntraFactory(treasury, 1 ether, address(uniswap));
        vm.prank(alice);
        (address token, address curve) =
            f.spawn("MigSec", "MSG", "ipfs://m", "migrate security", address(0), 0, 0, 0, 0, 0, 0);

        vm.roll(block.number + 4);
        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1.02 ether}(0, address(0));

        assertTrue(VyntraCurve(payable(curve)).migrated());
        assertEq(IERC20(token).allowance(curve, address(uniswap)), 0);

        vm.prank(bob);
        vm.expectRevert(VyntraCurve.Migrated.selector);
        VyntraCurve(payable(curve)).buy{value: 0.01 ether}(0, address(0));
    }

    function test_TaxConfigBounds() public {
        // valid edge
        vm.prank(alice);
        factory.spawn("T1", "T1", "ipfs://x", "d", address(0), 100, 1000, 2500, 2500, 2500, 2500);

        vm.prank(alice);
        vm.expectRevert(VyntraRevenueSplitter.BadConfig.selector);
        factory.spawn("T2", "T2", "ipfs://x", "d", address(0), 99, 0, 4000, 3000, 2000, 1000);

        vm.prank(alice);
        vm.expectRevert(VyntraRevenueSplitter.BadConfig.selector);
        factory.spawn("T3", "T3", "ipfs://x", "d", address(0), 500, 0, 3000, 3000, 3000, 500);
    }

    function test_KeeperBatchCap() public {
        VYNTRA vyn = new VYNTRA(address(this));
        VyntraMarket market = new VyntraMarket(address(vyn));
        VyntraBuybackVault vault = new VyntraBuybackVault(address(market), address(vyn));
        VyntraFeeRouter router = new VyntraFeeRouter(address(vault), treasury);
        VyntraKeeper keeper = new VyntraKeeper(address(router), address(vault));

        address[] memory curves = new address[](51);
        vm.expectRevert(VyntraKeeper.BatchTooLarge.selector);
        keeper.sweepProtocol(curves, 0);

        address[] memory splitters = new address[](51);
        vm.expectRevert(VyntraKeeper.BatchTooLarge.selector);
        keeper.sweepTax(splitters);
    }

    function test_FeeRouterEightyTwenty() public {
        VYNTRA vyn = new VYNTRA(address(this));
        VyntraMarket market = new VyntraMarket(address(vyn));
        VyntraBuybackVault vault = new VyntraBuybackVault(address(market), address(vyn));
        VyntraFeeRouter router = new VyntraFeeRouter(address(vault), treasury);

        vm.deal(address(router), 10 ether);
        uint256 opsBefore = treasury.balance;
        router.distribute();
        assertEq(treasury.balance - opsBefore, 2 ether);
        assertEq(address(vault).balance, 8 ether);
    }
}
