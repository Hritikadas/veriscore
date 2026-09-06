// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IHalo2Verifier {
    function verifyProof(bytes calldata proof, uint256[] calldata instances) external returns (bool);
}

/// @notice Registry that maps a verification-key digest to a deployed
///         Halo2 (EZKL) verifier contract and forwards verification calls,
///         so a single chain can host multiple models/keys.
contract ProofRegistry {
    mapping(bytes32 => address) public verifiers;
    address public owner;

    event Registered(bytes32 indexed vkDigest, address indexed verifier);
    event Verified(bytes32 indexed vkDigest, bool result);

    constructor() {
        owner = msg.sender;
    }

    function register(bytes32 vkDigest, address verifier) external returns (bool) {
        require(msg.sender == owner, "not owner");
        require(vkDigest != bytes32(0), "empty digest");
        require(verifier != address(0), "empty verifier");
        verifiers[vkDigest] = verifier;
        emit Registered(vkDigest, verifier);
        return true;
    }

    function verify(
        bytes32 vkDigest,
        bytes calldata proof,
        uint256[] calldata instances
    ) external returns (bool) {
        address v = verifiers[vkDigest];
        require(v != address(0), "unknown verifier");
        bool ok = IHalo2Verifier(v).verifyProof(proof, instances);
        emit Verified(vkDigest, ok);
        return ok;
    }

    function verifierOf(bytes32 vkDigest) external view returns (address) {
        return verifiers[vkDigest];
    }
}