// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VyntraFactory} from "../src/VyntraFactory.sol";
import {VyntraBoard} from "../src/VyntraBoard.sol";

contract VyntraBoardTest is Test {
    VyntraFactory factory;
    VyntraBoard board;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        factory = new VyntraFactory(makeAddr("treasury"), 1 ether, address(0));
        board = new VyntraBoard(address(factory));
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_PostAndReadReplies() public {
        vm.prank(alice);
        factory.spawn("Chat", "CHT", "ipfs://x", "hello world", address(0), 0, 0, 0, 0, 0, 0);

        vm.prank(bob);
        board.postReply(1, "first blood");
        vm.prank(alice);
        board.postReply(1, "gm ser");

        assertEq(board.getReplyCount(1), 2);
        VyntraBoard.Reply memory r0 = board.getReply(1, 0);
        assertEq(r0.author, bob);
        assertEq(r0.body, "first blood");

        VyntraBoard.Reply[] memory page = board.getReplies(1, 0, 10);
        assertEq(page.length, 2);
        assertEq(page[1].author, alice);
    }

    function test_PlatformThread() public {
        vm.prank(bob);
        board.postReply(0, "gm $VYNTRA");
        vm.prank(alice);
        board.postReply(board.PLATFORM_THREAD(), "flywheel go brrr");
        assertEq(board.getReplyCount(0), 2);
        VyntraBoard.Reply memory r0 = board.getReply(0, 0);
        assertEq(r0.author, bob);
        assertEq(r0.body, "gm $VYNTRA");
    }

    function test_RejectsBadLaunchAndBody() public {
        vm.prank(bob);
        vm.expectRevert(VyntraBoard.BadLaunch.selector);
        board.postReply(1, "no launch yet");

        vm.prank(alice);
        factory.spawn("Ok", "OK", "ipfs://x", "desc", address(0), 0, 0, 0, 0, 0, 0);

        vm.prank(bob);
        vm.expectRevert(VyntraBoard.EmptyBody.selector);
        board.postReply(1, "");

        vm.prank(bob);
        vm.expectRevert(VyntraBoard.EmptyBody.selector);
        board.postReply(1, "   ");

        string memory tooLong = _repeat("a", 281);
        vm.prank(bob);
        vm.expectRevert(VyntraBoard.BodyTooLong.selector);
        board.postReply(1, tooLong);
    }

    function _repeat(string memory ch, uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        bytes memory c = bytes(ch);
        for (uint256 i = 0; i < n; i++) {
            b[i] = c[0];
        }
        return string(b);
    }
}
