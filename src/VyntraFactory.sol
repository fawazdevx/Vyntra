// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VyntraToken} from "./VyntraToken.sol";
import {VyntraCurve} from "./VyntraCurve.sol";
import {VyntraRevenueSplitter} from "./VyntraRevenueSplitter.sol";

/// @title VyntraFactory
/// @notice Deploys VyntraToken + VyntraRevenueSplitter + VyntraCurve pairs for fair meme launches.
contract VyntraFactory {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant REAL_TOKEN_RESERVES = 800_000_000 ether;
    uint256 public constant VIRTUAL_BOT_RESERVES = 30 ether;
    uint256 public constant VIRTUAL_TOKEN_RESERVES = 1_073_000_000 ether;

    address public owner;
    address public protocolTreasury;
    /// @dev BDEX V2 Router02. address(0) keeps post-grad trading on the internal AMM.
    address public bdexRouter;
    uint256 public graduationThreshold;
    uint256 public launchCount;

    struct Launch {
        address token;
        address curve;
        address creator;
        address splitter;
        string name;
        string symbol;
        uint256 createdAt;
    }

    mapping(uint256 => Launch) public launches;
    mapping(address => uint256) public tokenId;
    mapping(address => uint256[]) public creatorLaunches;
    /// @dev keccak256(lowercased name) → launch id (1-indexed). Blocks duplicate names.
    mapping(bytes32 => uint256) public nameToId;
    /// @dev keccak256(uppercased symbol) → launch id.
    mapping(bytes32 => uint256) public symbolToId;

    event TokenSpawned(
        uint256 indexed id,
        address indexed token,
        address indexed curve,
        address creator,
        address splitter,
        string name,
        string symbol,
        string imageURI
    );
    event TreasuryUpdated(address treasury);
    event ThresholdUpdated(uint256 threshold);
    event BdexRouterUpdated(address router);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error BadName();
    error BadSymbol();
    error BadImage();
    error BadDescription();
    error NameTaken();
    error SymbolTaken();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address protocolTreasury_, uint256 graduationThreshold_, address bdexRouter_) {
        if (protocolTreasury_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        protocolTreasury = protocolTreasury_;
        graduationThreshold = graduationThreshold_;
        bdexRouter = bdexRouter_; // address(0) disables BDEX migrate for launches
    }

    /// @notice Launch a new meme token with optional Argus tax config. Optionally buy in-tx (msg.value).
    /// @dev Requires non-empty imageURI and description. Name/symbol must be unique (case-insensitive).
    ///      Pass all tax/split BPS as 0 to disable meme tax.
    function spawn(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        address referrer,
        uint256 buyTaxBps,
        uint256 sellTaxBps,
        uint256 fundsBps,
        uint256 buybackBps,
        uint256 dividendsBps,
        uint256 liquidityBps
    ) external payable returns (address token, address curve) {
        if (!_hasText(name) || bytes(name).length > 32) revert BadName();
        if (!_hasText(symbol) || bytes(symbol).length > 10) revert BadSymbol();
        if (!_hasText(imageURI)) revert BadImage();
        if (!_hasText(description)) revert BadDescription();

        bytes32 nameKey = _nameKey(name);
        bytes32 symbolKey = _symbolKey(symbol);
        if (nameToId[nameKey] != 0) revert NameTaken();
        if (symbolToId[symbolKey] != 0) revert SymbolTaken();

        address creator_ = msg.sender;

        VyntraToken vyntraToken = new VyntraToken(
            name, symbol, imageURI, description, address(this), TOTAL_SUPPLY
        );
        token = address(vyntraToken);

        VyntraRevenueSplitter revenueSplitter = new VyntraRevenueSplitter(
            token,
            creator_,
            buyTaxBps,
            sellTaxBps,
            fundsBps,
            buybackBps,
            dividendsBps,
            liquidityBps
        );
        address splitter_ = address(revenueSplitter);

        VyntraCurve bondingCurve = new VyntraCurve(
            token,
            creator_,
            protocolTreasury,
            address(this),
            VIRTUAL_BOT_RESERVES,
            VIRTUAL_TOKEN_RESERVES,
            REAL_TOKEN_RESERVES,
            graduationThreshold,
            TOTAL_SUPPLY,
            splitter_,
            bdexRouter
        );
        curve = address(bondingCurve);

        revenueSplitter.setCurve(curve);
        vyntraToken.setCurve(curve);
        require(vyntraToken.transfer(curve, TOTAL_SUPPLY), "SEED");

        uint256 id = ++launchCount;
        launches[id] = Launch(token, curve, creator_, splitter_, name, symbol, block.timestamp);
        tokenId[token] = id;
        creatorLaunches[creator_].push(id);
        nameToId[nameKey] = id;
        symbolToId[symbolKey] = id;

        emit TokenSpawned(id, token, curve, creator_, splitter_, name, symbol, imageURI);

        if (msg.value > 0) {
            VyntraCurve(payable(curve)).buyFor{value: msg.value}(creator_, 0, referrer);
        }
    }

    function isNameTaken(string calldata name) external view returns (bool) {
        return nameToId[_nameKey(name)] != 0;
    }

    function isSymbolTaken(string calldata symbol) external view returns (bool) {
        return symbolToId[_symbolKey(symbol)] != 0;
    }

    function getLaunch(uint256 id) external view returns (Launch memory) {
        return launches[id];
    }

    function getCreatorLaunchIds(address creator) external view returns (uint256[] memory) {
        return creatorLaunches[creator];
    }

    function setProtocolTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZeroAddress();
        protocolTreasury = treasury;
        emit TreasuryUpdated(treasury);
    }

    function setGraduationThreshold(uint256 threshold) external onlyOwner {
        graduationThreshold = threshold;
        emit ThresholdUpdated(threshold);
    }

    /// @notice Updates BDEX router for *new* launches only (existing curves keep their immutable router).
    /// @dev `router == address(0)` disables auto-migrate for subsequent launches (internal AMM remains).
    function setBdexRouter(address router) external onlyOwner {
        bdexRouter = router;
        emit BdexRouterUpdated(router);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @dev True if string has at least one non-whitespace byte.
    function _hasText(string memory str) internal pure returns (bool) {
        bytes memory b = bytes(str);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            // space, tab, LF, CR
            if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) return true;
        }
        return false;
    }

    function _nameKey(string memory name) internal pure returns (bytes32) {
        return keccak256(bytes(_lower(name)));
    }

    function _symbolKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(bytes(_upper(symbol)));
    }

    function _lower(string memory str) internal pure returns (string memory) {
        bytes memory b = bytes(str);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 65 && c <= 90) {
                b[i] = bytes1(c + 32);
            }
        }
        return string(b);
    }

    function _upper(string memory str) internal pure returns (string memory) {
        bytes memory b = bytes(str);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 97 && c <= 122) {
                b[i] = bytes1(c - 32);
            }
        }
        return string(b);
    }
}
