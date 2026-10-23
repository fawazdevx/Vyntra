// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraCurve} from "../src/VyntraCurve.sol";
import {VyntraToken} from "../src/VyntraToken.sol";
import {VyntraRevenueSplitter} from "../src/VyntraRevenueSplitter.sol";
import {MockBdexRouter} from "./mocks/MockBdexRouter.sol";

contract VyntraFactoryTest is Test {
    VyntraFactory factory;
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address referrer = makeAddr("referrer");

    uint256 constant GRAD_THRESHOLD = 1 ether;

    function setUp() public {
        factory = new VyntraFactory(treasury, GRAD_THRESHOLD, address(0));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _spawn(
        address who,
        string memory name,
        string memory symbol,
        string memory imageURI,
        string memory description,
        address ref
    ) internal returns (address token, address curve) {
        vm.prank(who);
        return factory.spawn(name, symbol, imageURI, description, ref, 0, 0, 0, 0, 0, 0);
    }

    function _spawnTaxed(
        address who,
        string memory name,
        string memory symbol,
        uint256 buyTax,
        uint256 sellTax
    ) internal returns (address token, address curve, address splitter) {
        // 40% funds / 30% buyback / 20% dividends / 10% liquidity
        vm.prank(who);
        (token, curve) = factory.spawn(
            name, symbol, "ipfs://img", "desc", address(0), buyTax, sellTax, 4000, 3000, 2000, 1000
        );
        splitter = factory.getLaunch(factory.launchCount()).splitter;
    }

    function test_SpawnCreatesTokenAndCurve() public {
        (address token, address curve) = _spawn(alice, "Cat Coin", "CAT", "ipfs://img", "meow", address(0));

        assertTrue(token != address(0));
        assertTrue(curve != address(0));
        assertEq(VyntraToken(token).name(), "Cat Coin");
        assertEq(VyntraToken(token).symbol(), "CAT");
        assertEq(VyntraToken(token).totalSupply(), factory.TOTAL_SUPPLY());
        assertEq(VyntraToken(token).balanceOf(curve), factory.TOTAL_SUPPLY());
        assertEq(factory.launchCount(), 1);

        VyntraFactory.Launch memory launch = factory.getLaunch(1);
        assertEq(launch.creator, alice);
        assertEq(launch.token, token);
        assertEq(launch.curve, curve);
        assertTrue(launch.splitter != address(0));
        assertEq(VyntraRevenueSplitter(payable(launch.splitter)).curve(), curve);
    }

    function test_SpawnWithSeedBuy() public {
        vm.prank(alice);
        (address token, address curve) =
            factory.spawn{value: 0.1 ether}("Dog", "DOG", "ipfs://dog", "woof", address(0), 0, 0, 0, 0, 0, 0);

        uint256 bal = VyntraToken(token).balanceOf(alice);
        assertGt(bal, 0);
        assertEq(VyntraCurve(payable(curve)).realBotReserves(), 0.1 ether - (0.1 ether * 125) / 10_000);
    }

    function test_BuyAndSell() public {
        (address token, address curve) = _spawn(alice, "Frog", "FROG", "ipfs://img", "desc", address(0));

        // Move past anti-snipe block 0
        vm.roll(block.number + 1);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 0.05 ether}(0, referrer);
        uint256 bobTokens = VyntraToken(token).balanceOf(bob);
        assertGt(bobTokens, 0);

        vm.prank(bob);
        VyntraToken(token).approve(curve, bobTokens);
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        uint256 botOut = VyntraCurve(payable(curve)).sell(bobTokens / 2, 0);
        assertGt(botOut, 0);
        assertEq(bob.balance, bobBefore + botOut);
    }

    function test_AntiSnipeBlocksNonCreatorOnLaunchBlock() public {
        (, address curve) = _spawn(alice, "Snipe", "SNP", "ipfs://img", "desc", address(0));

        vm.prank(bob);
        vm.expectRevert(VyntraCurve.AntiSnipe.selector);
        VyntraCurve(payable(curve)).buy{value: 0.01 ether}(0, address(0));
    }

    function test_CreatorFeesAccrueAndClaim() public {
        (, address curve) = _spawn(alice, "Fee", "FEE", "ipfs://img", "desc", address(0));
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, address(0));

        uint256 fees = VyntraCurve(payable(curve)).creatorFees();
        assertGt(fees, 0);

        uint256 before = alice.balance;
        vm.prank(alice);
        VyntraCurve(payable(curve)).claimCreatorFees();
        assertEq(alice.balance, before + fees);
        assertEq(VyntraCurve(payable(curve)).creatorFees(), 0);
    }

    function test_GraduationKeepsTradingOpenWithoutBdex() public {
        (address token, address curve) = _spawn(alice, "Grad", "GRD", "ipfs://img", "desc", address(0));
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1.02 ether}(0, address(0));

        assertTrue(VyntraCurve(payable(curve)).graduated());
        assertFalse(VyntraCurve(payable(curve)).migrated());
        assertTrue(VyntraCurve(payable(curve)).getProgressBps() >= 10_000);
        assertEq(
            keccak256(bytes(VyntraCurve(payable(curve)).tradeVenue())),
            keccak256(bytes("amm"))
        );

        // Without BDEX router, trading continues on the locked internal AMM
        uint256 before = VyntraToken(token).balanceOf(bob);
        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 0.05 ether}(0, address(0));
        assertGt(VyntraToken(token).balanceOf(bob), before);

        uint256 bal = VyntraToken(token).balanceOf(bob);
        vm.prank(bob);
        VyntraToken(token).approve(curve, bal);
        vm.prank(bob);
        uint256 botOut = VyntraCurve(payable(curve)).sell(bal / 4, 0);
        assertGt(botOut, 0);

        assertEq(tokenId_safe(token), 1);
    }

    function test_GraduationMigratesToBdex() public {
        MockBdexRouter bdex = new MockBdexRouter();
        VyntraFactory bdexFactory = new VyntraFactory(treasury, GRAD_THRESHOLD, address(bdex));

        vm.prank(alice);
        (address token, address curve) =
            bdexFactory.spawn("Migrate", "MIG", "ipfs://m", "migrate me", address(0), 0, 0, 0, 0, 0, 0);

        assertEq(VyntraCurve(payable(curve)).bdexRouter(), address(bdex));

        vm.roll(block.number + 4);
        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1.02 ether}(0, address(0));

        assertTrue(VyntraCurve(payable(curve)).graduated());
        assertTrue(VyntraCurve(payable(curve)).migrated());
        assertTrue(VyntraCurve(payable(curve)).externalPair() != address(0));
        assertEq(
            keccak256(bytes(VyntraCurve(payable(curve)).tradeVenue())),
            keccak256(bytes("bdex"))
        );
        assertEq(VyntraCurve(payable(curve)).realBotReserves(), 0);

        // Curve trading stops after migrate
        vm.prank(bob);
        vm.expectRevert(VyntraCurve.Migrated.selector);
        VyntraCurve(payable(curve)).buy{value: 0.01 ether}(0, address(0));

        // Creator fees remain claimable on the curve
        uint256 fees = VyntraCurve(payable(curve)).creatorFees();
        assertGt(fees, 0);
        uint256 before = alice.balance;
        vm.prank(alice);
        VyntraCurve(payable(curve)).claimCreatorFees();
        assertEq(alice.balance, before + fees);

        // LP locked at burn address
        assertGt(IERC20Like(VyntraCurve(payable(curve)).externalPair()).balanceOf(
            address(0x000000000000000000000000000000000000dEaD)
        ), 0);

        // Token should sit in the BDEX pair
        assertGt(VyntraToken(token).balanceOf(VyntraCurve(payable(curve)).externalPair()), 0);
    }

    function tokenId_safe(address token) internal view returns (uint256) {
        return factory.tokenId(token);
    }

    function test_ReferrerFees() public {
        (, address curve) = _spawn(alice, "Ref", "REF", "ipfs://img", "desc", address(0));
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, referrer);

        uint256 refFees = VyntraCurve(payable(curve)).referrerFees(referrer);
        assertGt(refFees, 0);

        uint256 before = referrer.balance;
        VyntraCurve(payable(curve)).claimReferrerFees(referrer);
        assertEq(referrer.balance, before + refFees);
    }

    function test_SpawnRequiresImageAndDescription() public {
        vm.prank(alice);
        vm.expectRevert(VyntraFactory.BadImage.selector);
        factory.spawn("NoImg", "NIM", "", "has desc", address(0), 0, 0, 0, 0, 0, 0);

        vm.prank(alice);
        vm.expectRevert(VyntraFactory.BadDescription.selector);
        factory.spawn("NoDesc", "NDC", "ipfs://x", "", address(0), 0, 0, 0, 0, 0, 0);

        vm.prank(alice);
        vm.expectRevert(VyntraFactory.BadImage.selector);
        factory.spawn("SpacesImg", "SPI", "   ", "has desc", address(0), 0, 0, 0, 0, 0, 0);

        vm.prank(alice);
        vm.expectRevert(VyntraFactory.BadDescription.selector);
        factory.spawn("SpacesDesc", "SPD", "ipfs://x", "  \n\t ", address(0), 0, 0, 0, 0, 0, 0);
    }

    function test_SpawnRejectsDuplicateNameAndSymbol() public {
        _spawn(alice, "Unique Cat", "UCAT", "ipfs://a", "first", address(0));

        vm.prank(bob);
        vm.expectRevert(VyntraFactory.NameTaken.selector);
        factory.spawn("unique cat", "OTHER", "ipfs://b", "dup name", address(0), 0, 0, 0, 0, 0, 0);

        vm.prank(bob);
        vm.expectRevert(VyntraFactory.SymbolTaken.selector);
        factory.spawn("Different", "ucat", "ipfs://c", "dup ticker", address(0), 0, 0, 0, 0, 0, 0);

        assertTrue(factory.isNameTaken("UNIQUE CAT"));
        assertTrue(factory.isSymbolTaken("ucat"));
        assertFalse(factory.isNameTaken("Fresh Name"));
    }

    function test_TaxAccruesToSplitter() public {
        (address token, address curve, address splitter) = _spawnTaxed(alice, "Taxed", "TAX", 500, 500);
        vm.roll(block.number + 4);

        uint256 buyIn = 1 ether;
        (, uint256 protocolFee, uint256 memeTax) = VyntraCurve(payable(curve)).quoteBuyDetailed(buyIn);
        assertEq(protocolFee, (buyIn * 125) / 10_000);
        assertEq(memeTax, ((buyIn - protocolFee) * 500) / 10_000);
        assertGt(memeTax, 0);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: buyIn}(0, address(0));

        VyntraRevenueSplitter s = VyntraRevenueSplitter(payable(splitter));
        uint256 totalAccrued =
            s.fundsAccrued() + s.buybackAccrued() + s.dividendsAccrued() + s.liquidityAccrued();
        assertEq(totalAccrued, memeTax);
        assertEq(s.fundsAccrued(), (memeTax * 4000) / 10_000);

        // Sell half
        uint256 bobTokens = VyntraToken(token).balanceOf(bob);
        vm.prank(bob);
        VyntraToken(token).approve(curve, bobTokens / 2);
        (, uint256 sellFee, uint256 sellTax) = VyntraCurve(payable(curve)).quoteSellDetailed(bobTokens / 2);
        assertGt(sellTax, 0);

        uint256 beforeAccrued = totalAccrued;
        vm.prank(bob);
        VyntraCurve(payable(curve)).sell(bobTokens / 2, 0);

        uint256 afterAccrued =
            s.fundsAccrued() + s.buybackAccrued() + s.dividendsAccrued() + s.liquidityAccrued();
        assertEq(afterAccrued, beforeAccrued + sellTax);
        assertGt(sellFee, 0);
    }

    function test_ClaimFunds() public {
        (, address curve, address splitter) = _spawnTaxed(alice, "Funds", "FND", 500, 0);
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, address(0));

        VyntraRevenueSplitter s = VyntraRevenueSplitter(payable(splitter));
        uint256 funds = s.fundsAccrued();
        assertGt(funds, 0);

        uint256 before = alice.balance;
        vm.prank(alice);
        s.claimFunds();
        assertEq(alice.balance, before + funds);
        assertEq(s.fundsAccrued(), 0);

        vm.prank(bob);
        vm.expectRevert(VyntraRevenueSplitter.NotCreator.selector);
        s.claimFunds();
    }

    function test_BuyAndBurnMeme() public {
        (address token, address curve, address splitter) = _spawnTaxed(alice, "Burn", "BRN", 500, 0);
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 2 ether}(0, address(0));

        VyntraRevenueSplitter s = VyntraRevenueSplitter(payable(splitter));
        uint256 buyback = s.buybackAccrued();
        assertGt(buyback, 0);

        // Past anti-snipe so splitter can buy
        vm.roll(block.number + 4);
        address burn = s.BURN();
        uint256 burnedBefore = VyntraToken(token).balanceOf(burn);

        // Spend half of buyback; buy may re-accrue tax into buckets
        uint256 spend = buyback / 2;
        s.buyAndBurnMeme(spend, 0);
        assertGt(VyntraToken(token).balanceOf(burn), burnedBefore);
        // buybackAccrued decreased by spend, then may increase from tax on the buyback buy
        assertLt(s.buybackAccrued(), buyback);
    }

    function test_InjectLiquidity() public {
        (, address curve, address splitter) = _spawnTaxed(alice, "Liq", "LIQ", 500, 0);
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, address(0));

        VyntraRevenueSplitter s = VyntraRevenueSplitter(payable(splitter));
        uint256 liq = s.liquidityAccrued();
        assertGt(liq, 0);

        uint256 reservesBefore = VyntraCurve(payable(curve)).realBotReserves();
        s.injectLiquidity(liq);
        assertEq(s.liquidityAccrued(), 0);
        assertEq(VyntraCurve(payable(curve)).realBotReserves(), reservesBefore + liq);
    }

    function test_ClaimDividends() public {
        (address token, address curve, address splitter) = _spawnTaxed(alice, "Div", "DIV", 500, 0);
        vm.roll(block.number + 4);

        vm.prank(bob);
        VyntraCurve(payable(curve)).buy{value: 1 ether}(0, address(0));

        VyntraRevenueSplitter s = VyntraRevenueSplitter(payable(splitter));
        uint256 divAccrued = s.dividendsAccrued();
        assertGt(divAccrued, 0);

        uint256 bobBal = VyntraToken(token).balanceOf(bob);
        assertGt(bobBal, 0);
        uint256 expected = (divAccrued * bobBal) / VyntraToken(token).totalSupply();
        assertGt(expected, 0);

        uint256 before = bob.balance;
        vm.prank(bob);
        s.claimDividends();
        assertEq(bob.balance, before + expected);
        assertEq(s.dividendsAccrued(), divAccrued - expected);
    }

    function test_BadTaxConfig() public {
        // Tax out of range (50 bps < 100)
        vm.prank(alice);
        vm.expectRevert(VyntraRevenueSplitter.BadConfig.selector);
        factory.spawn("Bad1", "BD1", "ipfs://x", "desc", address(0), 50, 0, 4000, 3000, 2000, 1000);

        // Tax enabled but split BPS don't sum to 10000
        vm.prank(alice);
        vm.expectRevert(VyntraRevenueSplitter.BadConfig.selector);
        factory.spawn("Bad2", "BD2", "ipfs://x", "desc", address(0), 500, 0, 1000, 1000, 1000, 1000);

        // Tax > 1000
        vm.prank(alice);
        vm.expectRevert(VyntraRevenueSplitter.BadConfig.selector);
        factory.spawn("Bad3", "BD3", "ipfs://x", "desc", address(0), 1500, 0, 4000, 3000, 2000, 1000);

        // Zero taxes with arbitrary split is OK
        vm.prank(alice);
        (address token,) =
            factory.spawn("OkZero", "OKZ", "ipfs://x", "desc", address(0), 0, 0, 1, 2, 3, 4);
        assertTrue(token != address(0));
    }
}

interface IERC20Like {
    function balanceOf(address) external view returns (uint256);
}
