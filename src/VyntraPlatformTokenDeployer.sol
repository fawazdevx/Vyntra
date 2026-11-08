// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VYNTRA} from "./VYNTRA.sol";

/// @notice Deploys the VYNTRA platform token at an address ending in 0x7f7.
/// @dev The salt search is a view operation; deployment itself uses one CREATE2.
contract VyntraPlatformTokenDeployer {
    uint160 public constant VANITY_SUFFIX = 0x7f7;
    uint256 private constant MAX_SALT_ATTEMPTS = 1_000_000;

    address public immutable owner;
    bool public deployed;

    error NotOwner();
    error AlreadyDeployed();
    error VanitySaltNotFound();
    error BadVanitySalt();
    error DeploymentFailed();

    event TokenDeployed(address indexed token, bytes32 indexed salt, address indexed recipient);

    constructor(address owner_) {
        if (owner_ == address(0)) revert NotOwner();
        owner = owner_;
    }

    /// @notice Find a salt that gives the platform token the required 0x7f7 suffix.
    function findVanitySalt() external view returns (bytes32 salt, address predicted) {
        bytes32 initCodeHash = _initCodeHash();

        for (uint256 i; i < MAX_SALT_ATTEMPTS; ++i) {
            salt = bytes32(i);
            predicted = _computeAddress(salt, initCodeHash);
            if ((uint160(predicted) & 0xfff) == VANITY_SUFFIX) return (salt, predicted);
        }

        revert VanitySaltNotFound();
    }

    /// @notice Deploy VYNTRA once, minting its fixed supply directly to the deployer.
    function deploy(bytes32 salt) external returns (VYNTRA token) {
        if (msg.sender != owner) revert NotOwner();
        if (deployed) revert AlreadyDeployed();

        bytes memory initCode = abi.encodePacked(type(VYNTRA).creationCode, abi.encode(owner));
        address predicted = _computeAddress(salt, keccak256(initCode));
        if ((uint160(predicted) & 0xfff) != VANITY_SUFFIX) revert BadVanitySalt();

        address tokenAddress;
        assembly ("memory-safe") {
            tokenAddress := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        if (tokenAddress == address(0) || tokenAddress != predicted) revert DeploymentFailed();

        deployed = true;
        token = VYNTRA(tokenAddress);
        emit TokenDeployed(tokenAddress, salt, owner);
    }

    function _initCodeHash() private view returns (bytes32) {
        return keccak256(abi.encodePacked(type(VYNTRA).creationCode, abi.encode(owner)));
    }

    function _computeAddress(bytes32 salt, bytes32 initCodeHash) private view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }
}
