// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Holds the ecosystem reserve and enforces VYNTRA's public release policy.
/// The reserve timelock is the sole authority for bucket reallocations and campaign creation.
contract VyntraReserveVault {
    using SafeERC20 for IERC20;

    enum Bucket {
        CommunityIncentives,
        EcosystemGrants,
        Unallocated
    }

    struct Campaign {
        Bucket bucket;
        uint256 amount;
        uint256 claimedAmount;
        bytes32 merkleRoot;
        bytes32 metadataHash;
        string metadataURI;
        uint64 claimStart;
        uint64 claimEnd;
        bool expired;
    }

    struct ReleaseRecord {
        uint64 timestamp;
        uint128 amount;
    }

    uint256 public constant COMMUNITY_ALLOCATION = 190_000_000 ether;
    uint256 public constant GRANTS_ALLOCATION = 142_500_000 ether;
    uint256 public constant UNALLOCATED_ALLOCATION = 617_500_000 ether;
    uint256 public constant ANNUAL_RELEASE_CAP = 50_000_000 ether;
    uint256 public constant RELEASE_WINDOW = 365 days;
    uint256 public constant MAX_RELEASES_PER_WINDOW = 64;

    IERC20 public immutable vyntra;
    address public immutable timelock;

    mapping(Bucket bucket => uint256 amount) public bucketBalance;
    mapping(uint256 campaignId => Campaign campaign) private _campaigns;
    mapping(uint256 campaignId => mapping(address account => bool claimed)) public hasClaimed;
    ReleaseRecord[MAX_RELEASES_PER_WINDOW] private _releaseRecords;
    uint8 private _releaseHead;
    uint8 private _releaseCount;

    event BucketReallocated(Bucket indexed fromBucket, Bucket indexed toBucket, uint256 amount);
    event CampaignCreated(
        uint256 indexed campaignId,
        Bucket indexed bucket,
        uint256 amount,
        bytes32 merkleRoot,
        bytes32 metadataHash,
        string metadataURI,
        uint64 claimStart,
        uint64 claimEnd
    );
    event CampaignClaimed(uint256 indexed campaignId, address indexed recipient, uint256 amount);
    event CampaignExpired(uint256 indexed campaignId, Bucket indexed bucket, uint256 unclaimedReturned);
    event ReserveReleaseRecorded(uint256 indexed campaignId, uint256 amount, uint256 rollingOutflow, uint256 annualCap);

    error OnlyTimelock();
    error InvalidBucket();
    error InsufficientBucketBalance();
    error InvalidCampaign();
    error CampaignAlreadyExists();
    error CampaignNotFound();
    error CampaignNotClaimable();
    error ClaimWindowNotOpen();
    error ClaimWindowClosed();
    error AlreadyClaimed();
    error InvalidProof();
    error ReleaseCapExceeded(uint256 used, uint256 requested, uint256 cap);
    error ReleaseWindowFull();
    error CampaignNotExpired();
    error ReserveUnderfunded();

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    constructor(address vyntra_, address timelock_) {
        require(vyntra_ != address(0) && timelock_ != address(0), "ZERO_ADDRESS");
        require(vyntra_.code.length > 0 && timelock_.code.length > 0, "NO_CODE");
        vyntra = IERC20(vyntra_);
        timelock = timelock_;

        bucketBalance[Bucket.CommunityIncentives] = COMMUNITY_ALLOCATION;
        bucketBalance[Bucket.EcosystemGrants] = GRANTS_ALLOCATION;
        bucketBalance[Bucket.Unallocated] = UNALLOCATED_ALLOCATION;
    }

    /// @notice Timelocked movement of budget from the unallocated reserve into an active program.
    function reallocateFromUnallocated(Bucket toBucket, uint256 amount) external onlyTimelock {
        if (toBucket == Bucket.Unallocated || amount == 0) revert InvalidBucket();
        uint256 available = bucketBalance[Bucket.Unallocated];
        if (amount > available) revert InsufficientBucketBalance();

        bucketBalance[Bucket.Unallocated] = available - amount;
        bucketBalance[toBucket] += amount;
        emit BucketReallocated(Bucket.Unallocated, toBucket, amount);
    }

    /// @notice Create a publicly disclosed, Merkle-claim campaign after the timelock delay.
    /// The released amount is charged against the shared rolling cap when this operation executes.
    function createCampaign(
        uint256 campaignId,
        Bucket bucket,
        uint256 amount,
        bytes32 merkleRoot,
        bytes32 metadataHash,
        string calldata metadataURI,
        uint64 claimStart,
        uint64 claimEnd
    ) external onlyTimelock {
        if (bucket == Bucket.Unallocated) revert InvalidBucket();
        if (campaignId == 0 || _campaigns[campaignId].amount != 0) revert CampaignAlreadyExists();
        if (
            amount == 0 || merkleRoot == bytes32(0) || metadataHash == bytes32(0) || bytes(metadataURI).length == 0
                || claimStart < block.timestamp || claimEnd <= claimStart
        ) revert InvalidCampaign();

        uint256 available = bucketBalance[bucket];
        if (amount > available) revert InsufficientBucketBalance();
        if (_reserveAccounting() > vyntra.balanceOf(address(this))) revert ReserveUnderfunded();

        uint256 rolling = _recordRelease(amount);
        bucketBalance[bucket] = available - amount;
        _campaigns[campaignId] = Campaign({
            bucket: bucket,
            amount: amount,
            claimedAmount: 0,
            merkleRoot: merkleRoot,
            metadataHash: metadataHash,
            metadataURI: metadataURI,
            claimStart: claimStart,
            claimEnd: claimEnd,
            expired: false
        });

        emit CampaignCreated(campaignId, bucket, amount, merkleRoot, metadataHash, metadataURI, claimStart, claimEnd);
        emit ReserveReleaseRecorded(campaignId, amount, rolling, ANNUAL_RELEASE_CAP);
    }

    /// @notice Claim a campaign allocation. Leaf format is keccak256(keccak256(abi.encode(account, amount))).
    function claim(uint256 campaignId, uint256 amount, bytes32[] calldata proof) external {
        Campaign storage campaign_ = _campaigns[campaignId];
        if (campaign_.amount == 0) revert CampaignNotFound();
        if (campaign_.expired || block.timestamp < campaign_.claimStart) revert ClaimWindowNotOpen();
        if (block.timestamp >= campaign_.claimEnd) revert ClaimWindowClosed();
        if (hasClaimed[campaignId][msg.sender]) revert AlreadyClaimed();
        if (amount == 0 || campaign_.claimedAmount + amount > campaign_.amount) revert CampaignNotClaimable();

        bytes32 leaf = campaignLeaf(msg.sender, amount);
        if (!MerkleProof.verify(proof, campaign_.merkleRoot, leaf)) revert InvalidProof();

        hasClaimed[campaignId][msg.sender] = true;
        campaign_.claimedAmount += amount;
        vyntra.safeTransfer(msg.sender, amount);
        emit CampaignClaimed(campaignId, msg.sender, amount);
    }

    /// @notice Return unclaimed campaign tokens to their original bucket after the claim window closes.
    function expireCampaign(uint256 campaignId) external {
        Campaign storage campaign_ = _campaigns[campaignId];
        if (campaign_.amount == 0) revert CampaignNotFound();
        if (campaign_.expired || block.timestamp < campaign_.claimEnd) revert CampaignNotExpired();

        uint256 returnedAmount = campaign_.amount - campaign_.claimedAmount;
        campaign_.expired = true;
        bucketBalance[campaign_.bucket] += returnedAmount;
        emit CampaignExpired(campaignId, campaign_.bucket, returnedAmount);
    }

    function campaign(uint256 campaignId) external view returns (Campaign memory) {
        Campaign memory result = _campaigns[campaignId];
        if (result.amount == 0) revert CampaignNotFound();
        return result;
    }

    function campaignRemaining(uint256 campaignId) external view returns (uint256) {
        Campaign storage campaign_ = _campaigns[campaignId];
        if (campaign_.amount == 0) revert CampaignNotFound();
        if (campaign_.expired) return 0;
        return campaign_.amount - campaign_.claimedAmount;
    }

    /// @notice Gross reserve allocations in the exact trailing 365-day window.
    function rollingOutflow() public view returns (uint256 used) {
        for (uint256 i; i < _releaseCount; ++i) {
            uint256 index = (uint256(_releaseHead) + i) % MAX_RELEASES_PER_WINDOW;
            ReleaseRecord storage record = _releaseRecords[index];
            if (uint256(record.timestamp) + RELEASE_WINDOW > block.timestamp) used += record.amount;
        }
    }

    function releaseRecordCount() external view returns (uint256) {
        return _releaseCount;
    }

    function campaignLeaf(address account, uint256 amount) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _recordRelease(uint256 amount) private returns (uint256 rolling) {
        _pruneExpiredReleases();
        rolling = rollingOutflow();
        if (rolling + amount > ANNUAL_RELEASE_CAP) {
            revert ReleaseCapExceeded(rolling, amount, ANNUAL_RELEASE_CAP);
        }
        if (_releaseCount == MAX_RELEASES_PER_WINDOW) revert ReleaseWindowFull();

        uint256 index = (uint256(_releaseHead) + _releaseCount) % MAX_RELEASES_PER_WINDOW;
        _releaseRecords[index] = ReleaseRecord({timestamp: uint64(block.timestamp), amount: uint128(amount)});
        ++_releaseCount;
        return rolling + amount;
    }

    function _pruneExpiredReleases() private {
        while (_releaseCount > 0) {
            ReleaseRecord storage oldest = _releaseRecords[_releaseHead];
            if (uint256(oldest.timestamp) + RELEASE_WINDOW > block.timestamp) break;
            delete _releaseRecords[_releaseHead];
            _releaseHead = uint8((uint256(_releaseHead) + 1) % MAX_RELEASES_PER_WINDOW);
            --_releaseCount;
        }
    }

    function _reserveAccounting() private view returns (uint256) {
        return bucketBalance[Bucket.CommunityIncentives] + bucketBalance[Bucket.EcosystemGrants]
            + bucketBalance[Bucket.Unallocated];
    }
}
