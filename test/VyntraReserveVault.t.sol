// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VYNTRA} from "../src/VYNTRA.sol";
import {VyntraReserveTimelock} from "../src/VyntraReserveTimelock.sol";
import {VyntraReserveVault} from "../src/VyntraReserveVault.sol";

contract VyntraReserveVaultTest is Test {
    VYNTRA private token;
    VyntraReserveTimelock private timelock;
    VyntraReserveVault private vault;
    address private safe = makeAddr("reserve-safe");
    address private alice = makeAddr("alice");
    uint256 private saltNonce;

    function setUp() public {
        token = new VYNTRA(address(this));
        timelock = new VyntraReserveTimelock(safe);
        vault = new VyntraReserveVault(address(token), address(timelock));
        assertTrue(token.transfer(address(vault), 950_000_000 ether));
    }

    function test_InitialAllocationAndMinimumDelay() public view {
        assertEq(vault.bucketBalance(VyntraReserveVault.Bucket.CommunityIncentives), 190_000_000 ether);
        assertEq(vault.bucketBalance(VyntraReserveVault.Bucket.EcosystemGrants), 142_500_000 ether);
        assertEq(vault.bucketBalance(VyntraReserveVault.Bucket.Unallocated), 617_500_000 ether);
        assertEq(token.balanceOf(address(vault)), 950_000_000 ether);
        assertEq(timelock.getMinDelay(), 30 days);
    }

    function test_TimelockDelayCannotBeReducedBelowFloor() public {
        bytes memory data = abi.encodeCall(timelock.updateDelay, (7 days));
        bytes32 salt = keccak256(abi.encode(++saltNonce));
        uint256 delay = timelock.getMinDelay();
        vm.prank(safe);
        timelock.schedule(address(timelock), 0, data, bytes32(0), salt, delay);
        vm.warp(vm.getBlockTimestamp() + delay);

        vm.expectRevert(VyntraReserveTimelock.DelayBelowFloor.selector);
        timelock.execute(address(timelock), 0, data, bytes32(0), salt);
    }

    function test_OnlyTimelockCanReallocateBudgets() public {
        vm.expectRevert(VyntraReserveVault.OnlyTimelock.selector);
        vault.reallocateFromUnallocated(VyntraReserveVault.Bucket.CommunityIncentives, 1 ether);
    }

    function test_ReallocationRequiresQueuedTimelockOperation() public {
        bytes memory data = abi.encodeCall(
            vault.reallocateFromUnallocated, (VyntraReserveVault.Bucket.EcosystemGrants, 10_000_000 ether)
        );
        _queueAndExecute(data);

        assertEq(vault.bucketBalance(VyntraReserveVault.Bucket.EcosystemGrants), 152_500_000 ether);
        assertEq(vault.bucketBalance(VyntraReserveVault.Bucket.Unallocated), 607_500_000 ether);
    }

    function test_CampaignClaimTransfersTokensAndPreventsDoubleClaim() public {
        uint256 amount = 20_000 ether;
        bytes32 root = vault.campaignLeaf(alice, amount);
        uint64 claimStart = uint64(vm.getBlockTimestamp() + 31 days);
        uint64 claimEnd = claimStart + 30 days;
        bytes memory data = abi.encodeCall(
            vault.createCampaign,
            (
                1,
                VyntraReserveVault.Bucket.CommunityIncentives,
                amount,
                root,
                keccak256("campaign-1.json"),
                "ipfs://campaign-1.json",
                claimStart,
                claimEnd
            )
        );
        _queueAndExecute(data);
        vm.warp(claimStart);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vault.claim(1, amount, proof);

        assertEq(token.balanceOf(alice), amount);
        assertEq(vault.campaignRemaining(1), 0);
        vm.prank(alice);
        vm.expectRevert(VyntraReserveVault.AlreadyClaimed.selector);
        vault.claim(1, amount, proof);
    }

    function test_CampaignCannotExceedItsBucket() public {
        uint64 claimStart = uint64(vm.getBlockTimestamp() + 31 days);
        bytes memory data = abi.encodeCall(
            vault.createCampaign,
            (
                1,
                VyntraReserveVault.Bucket.CommunityIncentives,
                190_000_000 ether + 1,
                keccak256("root"),
                keccak256("metadata"),
                "ipfs://campaign.json",
                claimStart,
                claimStart + 1 days
            )
        );
        bytes32 salt = _schedule(data);
        vm.expectRevert(VyntraReserveVault.InsufficientBucketBalance.selector);
        _execute(data, salt);
    }

    function test_ExpiredTokensReturnToBucketButDoNotRestoreRollingCapacity() public {
        uint256 amount = 50_000_000 ether;
        uint64 claimStart = uint64(vm.getBlockTimestamp() + 31 days);
        uint64 claimEnd = claimStart + 30 days;
        bytes memory firstCampaign = abi.encodeCall(
            vault.createCampaign,
            (
                1,
                VyntraReserveVault.Bucket.CommunityIncentives,
                amount,
                keccak256("root-1"),
                keccak256("metadata-1"),
                "ipfs://campaign-1.json",
                claimStart,
                claimEnd
            )
        );
        _queueAndExecute(firstCampaign);
        assertEq(vault.rollingOutflow(), amount);

        vm.warp(claimEnd);
        vault.expireCampaign(1);
        assertEq(vault.bucketBalance(VyntraReserveVault.Bucket.CommunityIncentives), 190_000_000 ether);
        assertEq(vault.campaignRemaining(1), 0);
        assertEq(vault.rollingOutflow(), amount);

        uint64 secondStart = uint64(vm.getBlockTimestamp() + 31 days);
        bytes memory secondCampaign = abi.encodeCall(
            vault.createCampaign,
            (
                2,
                VyntraReserveVault.Bucket.CommunityIncentives,
                1,
                keccak256("root-2"),
                keccak256("metadata-2"),
                "ipfs://campaign-2.json",
                secondStart,
                secondStart + 1 days
            )
        );
        bytes32 secondSalt = _schedule(secondCampaign);
        vm.expectPartialRevert(VyntraReserveVault.ReleaseCapExceeded.selector);
        _execute(secondCampaign, secondSalt);

        vm.warp(vm.getBlockTimestamp() + 365 days);
        assertEq(vault.rollingOutflow(), 0);
    }

    function test_RollingReleaseWindowExpiresExactlyAt365Days() public {
        uint256 amount = 1 ether;
        uint64 claimStart = uint64(vm.getBlockTimestamp() + 31 days);
        bytes memory data = abi.encodeCall(
            vault.createCampaign,
            (
                1,
                VyntraReserveVault.Bucket.CommunityIncentives,
                amount,
                keccak256("root"),
                keccak256("metadata"),
                "ipfs://campaign.json",
                claimStart,
                claimStart + 1 days
            )
        );
        _queueAndExecute(data);

        vm.warp(vm.getBlockTimestamp() + 365 days);
        assertEq(vault.rollingOutflow(), 0);
    }

    function _queueAndExecute(bytes memory data) private {
        bytes32 salt = _schedule(data);
        _execute(data, salt);
    }

    function _schedule(bytes memory data) private returns (bytes32 salt) {
        salt = keccak256(abi.encode(++saltNonce));
        uint256 delay = timelock.getMinDelay();
        vm.prank(safe);
        timelock.schedule(address(vault), 0, data, bytes32(0), salt, delay);
        vm.warp(vm.getBlockTimestamp() + delay);
    }

    function _execute(bytes memory data, bytes32 salt) private {
        timelock.execute(address(vault), 0, data, bytes32(0), salt);
    }
}
