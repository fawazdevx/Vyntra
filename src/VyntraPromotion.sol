// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVyntraPromotionFactory {
    struct Launch {
        address token;
        address curve;
        address creator;
        address splitter;
        string name;
        string symbol;
        uint256 createdAt;
    }

    function tokenId(address token) external view returns (uint256);
    function getLaunch(uint256 id) external view returns (Launch memory);
}

/// @notice Creator-only featured placement, paid in VYNTRA and burned.
/// The treasury timelock controls the price; promotion never promises trading outcomes.
contract VyntraPromotion {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_DURATION_DAYS = 7;
    uint256 public constant MAX_FEATURE_HORIZON = 30 days;
    uint256 public constant MAX_FEE_PER_DAY = 10_000_000 ether;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable vyntra;
    IVyntraPromotionFactory public immutable factory;
    address public immutable owner;
    uint256 public feePerDay;
    mapping(address token => uint256 until) public featuredUntil;

    event LaunchFeatured(address indexed token, address indexed creator, uint256 until, uint256 amountBurned);
    event FeatureFeeUpdated(uint256 oldFee, uint256 newFee);

    error NotOwner();
    error UnknownLaunch();
    error NotCreator();
    error BadDuration();
    error FeatureHorizonTooLong();
    error BadFee();

    constructor(address vyntra_, address factory_, address owner_, uint256 feePerDay_) {
        require(vyntra_ != address(0) && factory_ != address(0) && owner_ != address(0), "ZERO_ADDRESS");
        require(vyntra_.code.length > 0 && factory_.code.length > 0, "NO_CODE");
        require(feePerDay_ > 0 && feePerDay_ <= MAX_FEE_PER_DAY, "BAD_INITIAL_FEE");
        vyntra = IERC20(vyntra_);
        factory = IVyntraPromotionFactory(factory_);
        owner = owner_;
        feePerDay = feePerDay_;
    }

    function promotionCost(uint8 durationDays) public view returns (uint256) {
        if (durationDays == 0 || durationDays > MAX_DURATION_DAYS) revert BadDuration();
        return feePerDay * durationDays;
    }

    function feature(address token, uint8 durationDays) external returns (uint256 until) {
        uint256 id = factory.tokenId(token);
        if (id == 0) revert UnknownLaunch();
        IVyntraPromotionFactory.Launch memory launch = factory.getLaunch(id);
        if (launch.creator != msg.sender) revert NotCreator();

        uint256 cost = promotionCost(durationDays);
        if (cost == 0) revert BadFee();
        vyntra.safeTransferFrom(msg.sender, BURN, cost);

        uint256 start = featuredUntil[token] > block.timestamp ? featuredUntil[token] : block.timestamp;
        until = start + uint256(durationDays) * 1 days;
        if (until > block.timestamp + MAX_FEATURE_HORIZON) revert FeatureHorizonTooLong();
        featuredUntil[token] = until;
        emit LaunchFeatured(token, msg.sender, until, cost);
    }

    function setFeePerDay(uint256 newFee) external {
        if (msg.sender != owner) revert NotOwner();
        if (newFee == 0 || newFee > MAX_FEE_PER_DAY) revert BadFee();
        uint256 oldFee = feePerDay;
        feePerDay = newFee;
        emit FeatureFeeUpdated(oldFee, newFee);
    }
}
