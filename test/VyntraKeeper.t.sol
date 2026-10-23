// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VYNTRA} from "../src/VYNTRA.sol";
import {VyntraMarket} from "../src/VyntraMarket.sol";
import {VyntraBuybackVault} from "../src/VyntraBuybackVault.sol";
import {VyntraFeeRouter} from "../src/VyntraFeeRouter.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraCurve} from "../src/VyntraCurve.sol";
import {VyntraRevenueSplitter} from "../src/VyntraRevenueSplitter.sol";
import {VyntraKeeper} from "../src/VyntraKeeper.sol";
import {VyntraToken} from "../src/VyntraToken.sol";

contract VyntraKeeperTest is Test {
    address ops = makeAddr("ops");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address constant BURN = 0x000000000000000000000000000000000000dEaD;

    VYNTRA vyntraToken;
    VyntraMarket market;
    VyntraBuybackVault vault;
    VyntraFeeRouter router;
    VyntraFactory factory;
    VyntraKeeper keeper;

    function setUp() public {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(address(this), 100 ether);

        vyntraToken = new VYNTRA(address(this));
        market = new VyntraMarket(address(vyntraToken));
        vault = new VyntraBuybackVault(address(market), address(vyntraToken));
        router = new VyntraFeeRouter(address(vault), ops);
        factory = new VyntraFactory(address(router), 1 ether, address(0));
        keeper = new VyntraKeeper(address(router), address(vault));

        uint256 seedVyntra = 10_000_000 ether;
        vyntraToken.approve(address(market), seedVyntra);
        market.seed{value: 10 ether}(seedVyntra);
    }

    function test_SweepProtocolClaimsDistributeBurns() public {
        vm.prank(alice);
        (, address curve) =
            factory.spawn("Keep", "KEP", "ipfs://k", "keeper", address(0), 0, 0, 0, 0, 0, 0);
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, address(0));

        uint256 fees = VyntraCurve(payable(curve)).protocolFees();
        assertGt(fees, 0);

        address[] memory curves = new address[](1);
        curves[0] = curve;

        uint256 burnedBefore = vyntraToken.balanceOf(BURN);
        (uint256 claimed, uint256 burned) = keeper.sweepProtocol(curves, 0);

        assertEq(claimed, fees);
        assertEq(VyntraCurve(payable(curve)).protocolFees(), 0);
        assertEq(address(router).balance, 0);
        assertEq(address(vault).balance, 0);
        assertGt(burned, 0);
        assertEq(vyntraToken.balanceOf(BURN), burnedBefore + burned);
    }

    function test_SweepTaxBuybackAndLiquidity() public {
        vm.prank(alice);
        (address token, address curve) = factory.spawn(
            "TaxKeep", "TKP", "ipfs://t", "tax keeper", address(0), 500, 500, 4000, 3000, 2000, 1000
        );
        address splitter = factory.getLaunch(1).splitter;
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 2 ether}(0, address(0));

        VyntraRevenueSplitter s = VyntraRevenueSplitter(payable(splitter));
        uint256 bb = s.buybackAccrued();
        uint256 liq = s.liquidityAccrued();
        assertGt(bb, 0);
        assertGt(liq, 0);

        uint256 reservesBefore = VyntraCurve(payable(curve)).realBotReserves();
        uint256 burnedBefore = VyntraToken(token).balanceOf(BURN);

        address[] memory splitters = new address[](1);
        splitters[0] = splitter;

        vm.roll(block.number + 4); // clear anti-snipe for buyback buy
        (uint256 memeBot, uint256 liqOut) = keeper.sweepTax(splitters);

        assertEq(memeBot, bb);
        // inject runs after buyback; buyback re-accrues a little into liquidityAccrued first
        assertGe(liqOut, liq);
        assertLt(s.buybackAccrued(), bb);
        assertEq(s.liquidityAccrued(), 0);
        assertGt(VyntraToken(token).balanceOf(BURN), burnedBefore);
        assertGe(VyntraCurve(payable(curve)).realBotReserves(), reservesBefore + liq);
    }

    function test_SweepAll() public {
        vm.prank(alice);
        (, address curve) = factory.spawn(
            "All", "ALL", "ipfs://a", "all", address(0), 500, 0, 4000, 3000, 2000, 1000
        );
        address splitter = factory.getLaunch(1).splitter;
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1.5 ether}(0, address(0));
        vm.roll(block.number + 4);

        address[] memory curves = new address[](1);
        curves[0] = curve;
        address[] memory splitters = new address[](1);
        splitters[0] = splitter;

        (uint256 claimed, uint256 burned, uint256 meme, uint256 liq) =
            keeper.sweepAll(curves, splitters, 0);

        assertGt(claimed, 0);
        assertGt(burned, 0);
        assertGt(meme + liq, 0);
    }

    function test_SkipsEmptyAddresses() public {
        address[] memory curves = new address[](1);
        curves[0] = address(0);
        (uint256 claimed, uint256 burned) = keeper.sweepProtocol(curves, 0);
        assertEq(claimed, 0);
        assertEq(burned, 0);

        address[] memory empty;
        (claimed, burned) = keeper.sweepProtocol(empty, 0);
        assertEq(claimed, 0);
        assertEq(burned, 0);
    }
}
