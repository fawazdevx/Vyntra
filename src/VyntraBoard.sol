// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVyntraFactoryView {
    function launchCount() external view returns (uint256);
    function launches(uint256 id)
        external
        view
        returns (
            address token,
            address curve,
            address creator,
            address splitter,
            string memory name,
            string memory symbol,
            uint256 createdAt
        );
}

/// @title VyntraBoard
/// @notice On-chain replies for Vyntra launches. Wallet-signed, permanent, gas on BOT.
contract VyntraBoard {
    uint256 public constant MAX_BODY = 280;

    IVyntraFactoryView public immutable factory;

    struct Reply {
        address author;
        uint64 createdAt;
        string body;
    }

    /// @dev launchId => replies (1-indexed launch ids from factory)
    mapping(uint256 => Reply[]) private _replies;

    event ReplyPosted(
        uint256 indexed launchId,
        uint256 indexed replyIndex,
        address indexed author,
        string body
    );

    error BadLaunch();
    error EmptyBody();
    error BodyTooLong();

    constructor(address factory_) {
        require(factory_ != address(0), "FACTORY");
        factory = IVyntraFactoryView(factory_);
    }

    function postReply(uint256 launchId, string calldata body) external {
        if (launchId == 0 || launchId > factory.launchCount()) revert BadLaunch();
        // Confirm launch slot is occupied (token non-zero) via public mapping getter
        (address token,,,,,,) = factory.launches(launchId);
        if (token == address(0)) revert BadLaunch();

        bytes memory b = bytes(body);
        if (b.length == 0) revert EmptyBody();
        if (b.length > MAX_BODY) revert BodyTooLong();
        // Reject whitespace-only
        bool hasText;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) {
                hasText = true;
                break;
            }
        }
        if (!hasText) revert EmptyBody();

        _replies[launchId].push(
            Reply({author: msg.sender, createdAt: uint64(block.timestamp), body: body})
        );
        uint256 idx = _replies[launchId].length - 1;
        emit ReplyPosted(launchId, idx, msg.sender, body);
    }

    function getReplyCount(uint256 launchId) external view returns (uint256) {
        return _replies[launchId].length;
    }

    function getReply(uint256 launchId, uint256 index) external view returns (Reply memory) {
        return _replies[launchId][index];
    }

    /// @notice Page replies newest-last (chronological). offset from start, limit capped at 50.
    function getReplies(uint256 launchId, uint256 offset, uint256 limit)
        external
        view
        returns (Reply[] memory page)
    {
        Reply[] storage all = _replies[launchId];
        uint256 n = all.length;
        if (offset >= n || limit == 0) {
            return new Reply[](0);
        }
        if (limit > 50) limit = 50;
        uint256 end = offset + limit;
        if (end > n) end = n;
        uint256 len = end - offset;
        page = new Reply[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = all[offset + i];
        }
    }
}
