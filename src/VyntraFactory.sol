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
        address creatorFeeRecipient
    ) external returns (address market);
}

interface IVyntraLaunchMarket {
    function initializeCurve() external;
    function buyFor(address beneficiary, uint256 minTokensOut, address referrer) external payable returns (uint256);
}

interface IVyntraPreviousFactory {
    struct Launch {
        address token;
        address curve;
        address creator;
        address splitter;
        string name;
        string symbol;
        uint256 createdAt;
    }

    function launchCount() external view returns (uint256);
    function getLaunch(uint256 id) external view returns (Launch memory);
}

/// @title VyntraFactory
/// @notice Coordinates no-fee, buyer-funded launches that graduate into locked Uniswap v4 pools.
contract VyntraFactory {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
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
    event LaunchesImported(address indexed previousFactory, uint256 indexed firstId, uint256 indexed lastId);
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
    error BadThreshold();
    error BadImport();

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
        if (graduationThreshold_ == 0 || graduationThreshold_ > 1e36) revert BadThreshold();
        owner = msg.sender;
        protocolTreasury = protocolTreasury_;
        graduationThreshold = graduationThreshold_;
        poolManager = poolManager_;
        marketDeployer = marketDeployer_;
    }

    receive() external payable {}

    /// @notice Versioned capability for creator-selected fee recipients.
    function creatorFeePayoutVersion() external pure returns (uint256) { return 1; }

    /// @notice Launch a fixed-supply token on a buyer-funded curve, then graduate it into locked V4 liquidity.
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
            bytes32(0),
            msg.sender
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
            tokenSalt,
            msg.sender
        );
    }

    /// @notice Launch with an optional creator fee recipient; zero-value launch remains the default.
    function spawnWithSettings(
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
        address creatorFeeRecipient,
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
            tokenSalt,
            creatorFeeRecipient
        );
    }

    function _spawn(
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
        bytes32 tokenSalt,
        address creatorFeeRecipient_
    ) internal returns (address token, address curve) {
        uint256 balanceBefore = address(this).balance - msg.value;
        if (!_hasText(name) || bytes(name).length > 32) revert BadName();
        if (!_hasText(symbol) || bytes(symbol).length > 10) revert BadSymbol();
        if (!_hasText(imageURI)) revert BadImage();
        if (!_hasText(description)) revert BadDescription();
        if (creatorFeeRecipient_ == address(0)) revert ZeroAddress();
        if (
            buyTaxBps != 0 || sellTaxBps != 0 || fundsBps != 0 || buybackBps != 0
                || dividendsBps != 0 || liquidityBps != 0
        ) revert TaxesDisabled();
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
            creatorFeeRecipient_
        );

        vyntraToken.setCurve(curve);
        require(vyntraToken.transfer(curve, TOTAL_SUPPLY), "SEED");
        IVyntraLaunchMarket(curve).initializeCurve();

        uint256 id = ++launchCount;
        launches[id] = Launch(token, curve, creator_, splitter_, name, symbol, block.timestamp);
        tokenId[token] = id;
        creatorLaunches[creator_].push(id);
        nameToId[nameKey] = id;
        symbolToId[symbolKey] = id;

        emit TokenSpawned(id, token, curve, creator_, splitter_, name, symbol, imageURI);

        // A creator may include an optional first buy. Zero-value creation is the default and
        // requires only transaction gas; any value sent buys tokens for the creator.
        if (msg.value > 0) {
            IVyntraLaunchMarket(curve).buyFor{value: msg.value}(creator_, 0, referrer);
        }

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

    /// @notice Copies launch registry entries from a previous Vyntra factory without changing old markets.
    /// @dev The caller must be the new factory owner. Import consecutive batches starting at launchCount + 1.
    function importLaunches(address previousFactory, uint256 firstId, uint256 lastId) external onlyOwner {
        if (
            previousFactory == address(0) || previousFactory == address(this)
                || previousFactory.code.length == 0 || firstId != launchCount + 1 || lastId < firstId
        ) revert BadImport();
        if (lastId > IVyntraPreviousFactory(previousFactory).launchCount()) revert BadImport();

        for (uint256 id = firstId; id <= lastId; ++id) {
            IVyntraPreviousFactory.Launch memory previous =
                IVyntraPreviousFactory(previousFactory).getLaunch(id);
            if (
                previous.token == address(0) || previous.token.code.length == 0
                    || previous.curve == address(0) || previous.curve.code.length == 0
            ) revert BadImport();

            bytes32 nameKey = _nameKey(previous.name);
            bytes32 symbolKey = _symbolKey(previous.symbol);
            if (nameToId[nameKey] != 0 || symbolToId[symbolKey] != 0 || tokenId[previous.token] != 0) {
                revert BadImport();
            }

            launches[id] = Launch(
                previous.token,
                previous.curve,
                previous.creator,
                previous.splitter,
                previous.name,
                previous.symbol,
                previous.createdAt
            );
            tokenId[previous.token] = id;
            creatorLaunches[previous.creator].push(id);
            nameToId[nameKey] = id;
            symbolToId[symbolKey] = id;
        }

        launchCount = lastId;
        emit LaunchesImported(previousFactory, firstId, lastId);
    }

    function setProtocolTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZeroAddress();
        protocolTreasury = treasury;
        emit TreasuryUpdated(treasury);
    }

    function setGraduationThreshold(uint256 threshold) external onlyOwner {
        if (threshold == 0 || threshold > 1e36) revert BadThreshold();
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
