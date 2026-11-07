// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VyntraToken} from "./VyntraToken.sol";

interface IVyntraMarketDeployer {
    function deployMarket(
        address token,
        address creator,
        address protocolTreasury,
        uint256 graduationThreshold,
        uint256 totalSupply,
        address splitter,
        address poolManager,
        uint256 minInitialLiquidity,
        uint256 maxInitialLiquidity
    ) external returns (address market);
}

interface IVyntraLaunchMarket {
    function initializePool() external payable;
}

/// @title VyntraFactory
/// @notice Coordinates fixed-supply launches into Vyntra's no-hook Uniswap v4 markets.
contract VyntraFactory {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant MIN_LAUNCH_LIQUIDITY = 5 ether;
    uint256 public constant MAX_LAUNCH_LIQUIDITY = 100 ether;
    uint160 public constant VANITY_SUFFIX = 0x7f7;

    address public owner;
    address public protocolTreasury;
    address public immutable poolManager;
    address public immutable marketDeployer;
    /// @dev Retained as a zero-valued compatibility getter. Vyntra markets do not migrate.
    address public uniswapV2Router;
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
    event UniswapRouterUpdated(address router);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error BadName();
    error BadSymbol();
    error BadImage();
    error BadDescription();
    error NameTaken();
    error SymbolTaken();
    error ZeroAddress();
    error BadVanitySalt();
    error VanitySaltNotFound();
    error TaxesDisabled();
    error MigrationDisabled();
    error BadInitialLiquidity();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address protocolTreasury_,
        uint256 graduationThreshold_,
        address poolManager_,
        address marketDeployer_
    ) {
        if (
            protocolTreasury_ == address(0) || poolManager_ == address(0)
                || poolManager_.code.length == 0 || marketDeployer_ == address(0)
                || marketDeployer_.code.length == 0
        ) {
            revert ZeroAddress();
        }
        owner = msg.sender;
        protocolTreasury = protocolTreasury_;
        graduationThreshold = graduationThreshold_;
        poolManager = poolManager_;
        marketDeployer = marketDeployer_;
    }

    receive() external payable {}

    /// @notice Launch a fixed-supply token directly into a locked Uniswap v4 HYPE pool.
    /// @dev Requires non-empty imageURI and description. Name/symbol must be unique (case-insensitive).
    ///      Legacy tax arguments must be zero; v4 pools use the fixed LP fee, with no custom hook.
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
        return _spawn(
            name,
            symbol,
            imageURI,
            description,
            referrer,
            buyTaxBps,
            sellTaxBps,
            fundsBps,
            buybackBps,
            dividendsBps,
            liquidityBps,
            bytes32(0)
        );
    }

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
        uint256 liquidityBps,
        bytes32 tokenSalt
    ) external payable returns (address token, address curve) {
        return _spawn(
            name,
            symbol,
            imageURI,
            description,
            referrer,
            buyTaxBps,
            sellTaxBps,
            fundsBps,
            buybackBps,
            dividendsBps,
            liquidityBps,
            tokenSalt
        );
    }

    function _spawn(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        address,
        uint256 buyTaxBps,
        uint256 sellTaxBps,
        uint256 fundsBps,
        uint256 buybackBps,
        uint256 dividendsBps,
        uint256 liquidityBps,
        bytes32 tokenSalt
    ) internal returns (address token, address curve) {
        uint256 balanceBefore = address(this).balance - msg.value;
        if (!_hasText(name) || bytes(name).length > 32) revert BadName();
        if (!_hasText(symbol) || bytes(symbol).length > 10) revert BadSymbol();
        if (!_hasText(imageURI)) revert BadImage();
        if (!_hasText(description)) revert BadDescription();
        if (
            buyTaxBps != 0 || sellTaxBps != 0 || fundsBps != 0 || buybackBps != 0
                || dividendsBps != 0 || liquidityBps != 0
        ) revert TaxesDisabled();
        if (msg.value < MIN_LAUNCH_LIQUIDITY || msg.value > MAX_LAUNCH_LIQUIDITY) {
            revert BadInitialLiquidity();
        }

        bytes32 nameKey = _nameKey(name);
        bytes32 symbolKey = _symbolKey(symbol);
        if (nameToId[nameKey] != 0) revert NameTaken();
        if (symbolToId[symbolKey] != 0) revert SymbolTaken();

        address creator_ = msg.sender;

        bytes32 initCodeHash = _tokenInitCodeHash(name, symbol, imageURI, description);
        if (tokenSalt == bytes32(0)) {
            (tokenSalt,) = _findVanitySalt(initCodeHash);
        }
        token = _predictCreate2(tokenSalt, initCodeHash);
        if ((uint160(token) & 0xfff) != VANITY_SUFFIX) revert BadVanitySalt();

        VyntraToken vyntraToken = new VyntraToken{salt: tokenSalt}(
            name, symbol, imageURI, description, address(this), TOTAL_SUPPLY
        );
        token = address(vyntraToken);

        address splitter_ = address(0);

        curve = IVyntraMarketDeployer(marketDeployer).deployMarket(
            token,
            creator_,
            protocolTreasury,
            graduationThreshold,
            TOTAL_SUPPLY,
            splitter_,
            poolManager,
            MIN_LAUNCH_LIQUIDITY,
            MAX_LAUNCH_LIQUIDITY
        );

        vyntraToken.setCurve(curve);
        require(vyntraToken.transfer(curve, TOTAL_SUPPLY), "SEED");
        IVyntraLaunchMarket(curve).initializePool{value: msg.value}();

        uint256 id = ++launchCount;
        launches[id] = Launch(token, curve, creator_, splitter_, name, symbol, block.timestamp);
        tokenId[token] = id;
        creatorLaunches[creator_].push(id);
        nameToId[nameKey] = id;
        symbolToId[symbolKey] = id;

        emit TokenSpawned(id, token, curve, creator_, splitter_, name, symbol, imageURI);

        uint256 refund = address(this).balance - balanceBefore;
        if (refund > 0) {
            (bool sent,) = payable(creator_).call{value: refund}("");
            require(sent, "SEED_REFUND");
        }
    }

    function isNameTaken(string calldata name) external view returns (bool) {
        return nameToId[_nameKey(name)] != 0;
    }

    function isSymbolTaken(string calldata symbol) external view returns (bool) {
        return symbolToId[_symbolKey(symbol)] != 0;
    }

    /// @notice Finds the first salt that makes the Vyntra token address end with 0x7f7.
    /// @dev Call off-chain before spawn; searching does not add work to the launch transaction.
    function findVanitySalt(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description
    ) external view returns (bytes32 salt, address predictedToken) {
        bytes32 initCodeHash = _tokenInitCodeHash(name, symbol, imageURI, description);
        return _findVanitySalt(initCodeHash);
    }

    function _findVanitySalt(bytes32 initCodeHash)
        private
        view
        returns (bytes32 salt, address predictedToken)
    {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, 0x60))
            mstore8(ptr, 0xff)
            mstore(add(ptr, 0x01), shl(96, address()))
            mstore(add(ptr, 0x35), initCodeHash)
            for { let i := 0 } lt(i, 0x10000) { i := add(i, 1) } {
                mstore(add(ptr, 0x15), i)
                let hash := keccak256(ptr, 0x55)
                if eq(and(hash, 0xfff), 0x7f7) {
                    salt := i
                    predictedToken := and(hash, 0xffffffffffffffffffffffffffffffffffffffff)
                    break
                }
            }
        }
        if (predictedToken == address(0)) revert VanitySaltNotFound();
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

    /// @notice Legacy selector kept for old integrations; liquidity migration is permanently disabled.
    function setUniswapV2Router(address) external pure {
        revert MigrationDisabled();
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

    function _tokenInitCodeHash(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description
    ) private view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                type(VyntraToken).creationCode,
                abi.encode(name, symbol, imageURI, description, address(this), TOTAL_SUPPLY)
            )
        );
    }

    function _predictCreate2(bytes32 salt, bytes32 initCodeHash) private view returns (address predicted) {
        bytes32 hash;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, 0x60))
            mstore8(ptr, 0xff)
            mstore(add(ptr, 0x01), shl(96, address()))
            mstore(add(ptr, 0x15), salt)
            mstore(add(ptr, 0x35), initCodeHash)
            hash := keccak256(ptr, 0x55)
        }
        predicted = address(uint160(uint256(hash)));
    }
}
