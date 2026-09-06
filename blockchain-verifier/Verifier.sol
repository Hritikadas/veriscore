// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract Halo2Verifier {
    uint256 internal constant    DELTA = 4131629893567559867359510883348571134090853742863529169391034518566172092834;
    uint256 internal constant        R = 21888242871839275222246405745257275088548364400416034343698204186575808495617; 

    uint256 internal constant FIRST_QUOTIENT_X_CPTR = 0x0824;
    uint256 internal constant  LAST_QUOTIENT_X_CPTR = 0x09e4;

    uint256 internal constant                VK_MPTR = 0x0880;
    uint256 internal constant         VK_DIGEST_MPTR = 0x0880;
    uint256 internal constant     NUM_INSTANCES_MPTR = 0x08a0;
    uint256 internal constant                 K_MPTR = 0x08c0;
    uint256 internal constant             N_INV_MPTR = 0x08e0;
    uint256 internal constant             OMEGA_MPTR = 0x0900;
    uint256 internal constant         OMEGA_INV_MPTR = 0x0920;
    uint256 internal constant    OMEGA_INV_TO_L_MPTR = 0x0940;
    uint256 internal constant   HAS_ACCUMULATOR_MPTR = 0x0960;
    uint256 internal constant        ACC_OFFSET_MPTR = 0x0980;
    uint256 internal constant     NUM_ACC_LIMBS_MPTR = 0x09a0;
    uint256 internal constant NUM_ACC_LIMB_BITS_MPTR = 0x09c0;
    uint256 internal constant              G1_X_MPTR = 0x09e0;
    uint256 internal constant              G1_Y_MPTR = 0x0a00;
    uint256 internal constant            G2_X_1_MPTR = 0x0a20;
    uint256 internal constant            G2_X_2_MPTR = 0x0a40;
    uint256 internal constant            G2_Y_1_MPTR = 0x0a60;
    uint256 internal constant            G2_Y_2_MPTR = 0x0a80;
    uint256 internal constant      NEG_S_G2_X_1_MPTR = 0x0aa0;
    uint256 internal constant      NEG_S_G2_X_2_MPTR = 0x0ac0;
    uint256 internal constant      NEG_S_G2_Y_1_MPTR = 0x0ae0;
    uint256 internal constant      NEG_S_G2_Y_2_MPTR = 0x0b00;

    uint256 internal constant CHALLENGE_MPTR = 0x1060;

    uint256 internal constant THETA_MPTR = 0x1060;
    uint256 internal constant  BETA_MPTR = 0x1080;
    uint256 internal constant GAMMA_MPTR = 0x10a0;
    uint256 internal constant     Y_MPTR = 0x10c0;
    uint256 internal constant     X_MPTR = 0x10e0;
    uint256 internal constant  ZETA_MPTR = 0x1100;
    uint256 internal constant    NU_MPTR = 0x1120;
    uint256 internal constant    MU_MPTR = 0x1140;

    uint256 internal constant       ACC_LHS_X_MPTR = 0x1160;
    uint256 internal constant       ACC_LHS_Y_MPTR = 0x1180;
    uint256 internal constant       ACC_RHS_X_MPTR = 0x11a0;
    uint256 internal constant       ACC_RHS_Y_MPTR = 0x11c0;
    uint256 internal constant             X_N_MPTR = 0x11e0;
    uint256 internal constant X_N_MINUS_1_INV_MPTR = 0x1200;
    uint256 internal constant          L_LAST_MPTR = 0x1220;
    uint256 internal constant         L_BLIND_MPTR = 0x1240;
    uint256 internal constant             L_0_MPTR = 0x1260;
    uint256 internal constant   INSTANCE_EVAL_MPTR = 0x1280;
    uint256 internal constant   QUOTIENT_EVAL_MPTR = 0x12a0;
    uint256 internal constant      QUOTIENT_X_MPTR = 0x12c0;
    uint256 internal constant      QUOTIENT_Y_MPTR = 0x12e0;
    uint256 internal constant          R_EVAL_MPTR = 0x1300;
    uint256 internal constant   PAIRING_LHS_X_MPTR = 0x1320;
    uint256 internal constant   PAIRING_LHS_Y_MPTR = 0x1340;
    uint256 internal constant   PAIRING_RHS_X_MPTR = 0x1360;
    uint256 internal constant   PAIRING_RHS_Y_MPTR = 0x1380;

    function verifyProof(
        bytes calldata proof,
        uint256[] calldata instances
    ) public returns (bool) {
        assembly {
            // Read EC point (x, y) at (proof_cptr, proof_cptr + 0x20),
            // and check if the point is on affine plane,
            // and store them in (hash_mptr, hash_mptr + 0x20).
            // Return updated (success, proof_cptr, hash_mptr).
            function read_ec_point(success, proof_cptr, hash_mptr, q) -> ret0, ret1, ret2 {
                let x := calldataload(proof_cptr)
                let y := calldataload(add(proof_cptr, 0x20))
                ret0 := and(success, lt(x, q))
                ret0 := and(ret0, lt(y, q))
                ret0 := and(ret0, eq(mulmod(y, y, q), addmod(mulmod(x, mulmod(x, x, q), q), 3, q)))
                mstore(hash_mptr, x)
                mstore(add(hash_mptr, 0x20), y)
                ret1 := add(proof_cptr, 0x40)
                ret2 := add(hash_mptr, 0x40)
            }

            // Squeeze challenge by keccak256(memory[0..hash_mptr]),
            // and store hash mod r as challenge in challenge_mptr,
            // and push back hash in 0x00 as the first input for next squeeze.
            // Return updated (challenge_mptr, hash_mptr).
            function squeeze_challenge(challenge_mptr, hash_mptr, r) -> ret0, ret1 {
                let hash := keccak256(0x00, hash_mptr)
                mstore(challenge_mptr, mod(hash, r))
                mstore(0x00, hash)
                ret0 := add(challenge_mptr, 0x20)
                ret1 := 0x20
            }

            // Squeeze challenge without absorbing new input from calldata,
            // by putting an extra 0x01 in memory[0x20] and squeeze by keccak256(memory[0..21]),
            // and store hash mod r as challenge in challenge_mptr,
            // and push back hash in 0x00 as the first input for next squeeze.
            // Return updated (challenge_mptr).
            function squeeze_challenge_cont(challenge_mptr, r) -> ret {
                mstore8(0x20, 0x01)
                let hash := keccak256(0x00, 0x21)
                mstore(challenge_mptr, mod(hash, r))
                mstore(0x00, hash)
                ret := add(challenge_mptr, 0x20)
            }

            // Batch invert values in memory[mptr_start..mptr_end] in place.
            // Return updated (success).
            function batch_invert(success, mptr_start, mptr_end) -> ret {
                let gp_mptr := mptr_end
                let gp := mload(mptr_start)
                let mptr := add(mptr_start, 0x20)
                for
                    {}
                    lt(mptr, sub(mptr_end, 0x20))
                    {}
                {
                    gp := mulmod(gp, mload(mptr), R)
                    mstore(gp_mptr, gp)
                    mptr := add(mptr, 0x20)
                    gp_mptr := add(gp_mptr, 0x20)
                }
                gp := mulmod(gp, mload(mptr), R)

                mstore(gp_mptr, 0x20)
                mstore(add(gp_mptr, 0x20), 0x20)
                mstore(add(gp_mptr, 0x40), 0x20)
                mstore(add(gp_mptr, 0x60), gp)
                mstore(add(gp_mptr, 0x80), sub(R, 2))
                mstore(add(gp_mptr, 0xa0), R)
                ret := and(success, staticcall(gas(), 0x05, gp_mptr, 0xc0, gp_mptr, 0x20))
                let all_inv := mload(gp_mptr)

                let first_mptr := mptr_start
                let second_mptr := add(first_mptr, 0x20)
                gp_mptr := sub(gp_mptr, 0x20)
                for
                    {}
                    lt(second_mptr, mptr)
                    {}
                {
                    let inv := mulmod(all_inv, mload(gp_mptr), R)
                    all_inv := mulmod(all_inv, mload(mptr), R)
                    mstore(mptr, inv)
                    mptr := sub(mptr, 0x20)
                    gp_mptr := sub(gp_mptr, 0x20)
                }
                let inv_first := mulmod(all_inv, mload(second_mptr), R)
                let inv_second := mulmod(all_inv, mload(first_mptr), R)
                mstore(first_mptr, inv_first)
                mstore(second_mptr, inv_second)
            }

            // Add (x, y) into point at (0x00, 0x20).
            // Return updated (success).
            function ec_add_acc(success, x, y) -> ret {
                mstore(0x40, x)
                mstore(0x60, y)
                ret := and(success, staticcall(gas(), 0x06, 0x00, 0x80, 0x00, 0x40))
            }

            // Scale point at (0x00, 0x20) by scalar.
            function ec_mul_acc(success, scalar) -> ret {
                mstore(0x40, scalar)
                ret := and(success, staticcall(gas(), 0x07, 0x00, 0x60, 0x00, 0x40))
            }

            // Add (x, y) into point at (0x80, 0xa0).
            // Return updated (success).
            function ec_add_tmp(success, x, y) -> ret {
                mstore(0xc0, x)
                mstore(0xe0, y)
                ret := and(success, staticcall(gas(), 0x06, 0x80, 0x80, 0x80, 0x40))
            }

            // Scale point at (0x80, 0xa0) by scalar.
            // Return updated (success).
            function ec_mul_tmp(success, scalar) -> ret {
                mstore(0xc0, scalar)
                ret := and(success, staticcall(gas(), 0x07, 0x80, 0x60, 0x80, 0x40))
            }

            // Perform pairing check.
            // Return updated (success).
            function ec_pairing(success, lhs_x, lhs_y, rhs_x, rhs_y) -> ret {
                mstore(0x00, lhs_x)
                mstore(0x20, lhs_y)
                mstore(0x40, mload(G2_X_1_MPTR))
                mstore(0x60, mload(G2_X_2_MPTR))
                mstore(0x80, mload(G2_Y_1_MPTR))
                mstore(0xa0, mload(G2_Y_2_MPTR))
                mstore(0xc0, rhs_x)
                mstore(0xe0, rhs_y)
                mstore(0x100, mload(NEG_S_G2_X_1_MPTR))
                mstore(0x120, mload(NEG_S_G2_X_2_MPTR))
                mstore(0x140, mload(NEG_S_G2_Y_1_MPTR))
                mstore(0x160, mload(NEG_S_G2_Y_2_MPTR))
                ret := and(success, staticcall(gas(), 0x08, 0x00, 0x180, 0x00, 0x20))
                ret := and(ret, mload(0x00))
            }

            // Modulus
            let q := 21888242871839275222246405745257275088696311157297823662689037894645226208583 // BN254 base field
            let r := 21888242871839275222246405745257275088548364400416034343698204186575808495617 // BN254 scalar field 

            // Initialize success as true
            let success := true

            {
                // Load vk_digest and num_instances of vk into memory
                mstore(0x0880, 0x2d03d5b50f18862a7338be3e9ccaf0d18526d22a25ce527c6036a7ceff3221c6) // vk_digest
                mstore(0x08a0, 0x0000000000000000000000000000000000000000000000000000000000000001) // num_instances

                // Check valid length of proof
                success := and(success, eq(0x12a0, proof.length))

                // Check valid length of instances
                let num_instances := mload(NUM_INSTANCES_MPTR)
                success := and(success, eq(num_instances, instances.length))

                // Absorb vk diegst
                mstore(0x00, mload(VK_DIGEST_MPTR))

                // Read instances and witness commitments and generate challenges
                let hash_mptr := 0x20
                let instance_cptr := instances.offset
                for
                    { let instance_cptr_end := add(instance_cptr, mul(0x20, num_instances)) }
                    lt(instance_cptr, instance_cptr_end)
                    {}
                {
                    let instance := calldataload(instance_cptr)
                    success := and(success, lt(instance, r))
                    mstore(hash_mptr, instance)
                    instance_cptr := add(instance_cptr, 0x20)
                    hash_mptr := add(hash_mptr, 0x20)
                }

                let proof_cptr := proof.offset
                let challenge_mptr := CHALLENGE_MPTR

                // Phase 1
                for
                    { let proof_cptr_end := add(proof_cptr, 0x0180) }
                    lt(proof_cptr, proof_cptr_end)
                    {}
                {
                    success, proof_cptr, hash_mptr := read_ec_point(success, proof_cptr, hash_mptr, q)
                }

                challenge_mptr, hash_mptr := squeeze_challenge(challenge_mptr, hash_mptr, r)

                // Phase 2
                for
                    { let proof_cptr_end := add(proof_cptr, 0x02c0) }
                    lt(proof_cptr, proof_cptr_end)
                    {}
                {
                    success, proof_cptr, hash_mptr := read_ec_point(success, proof_cptr, hash_mptr, q)
                }

                challenge_mptr, hash_mptr := squeeze_challenge(challenge_mptr, hash_mptr, r)
                challenge_mptr := squeeze_challenge_cont(challenge_mptr, r)

                // Phase 3
                for
                    { let proof_cptr_end := add(proof_cptr, 0x0380) }
                    lt(proof_cptr, proof_cptr_end)
                    {}
                {
                    success, proof_cptr, hash_mptr := read_ec_point(success, proof_cptr, hash_mptr, q)
                }

                challenge_mptr, hash_mptr := squeeze_challenge(challenge_mptr, hash_mptr, r)

                // Phase 4
                for
                    { let proof_cptr_end := add(proof_cptr, 0x0200) }
                    lt(proof_cptr, proof_cptr_end)
                    {}
                {
                    success, proof_cptr, hash_mptr := read_ec_point(success, proof_cptr, hash_mptr, q)
                }

                challenge_mptr, hash_mptr := squeeze_challenge(challenge_mptr, hash_mptr, r)

                // Read evaluations
                for
                    { let proof_cptr_end := add(proof_cptr, 0x0860) }
                    lt(proof_cptr, proof_cptr_end)
                    {}
                {
                    let eval := calldataload(proof_cptr)
                    success := and(success, lt(eval, r))
                    mstore(hash_mptr, eval)
                    proof_cptr := add(proof_cptr, 0x20)
                    hash_mptr := add(hash_mptr, 0x20)
                }

                // Read batch opening proof and generate challenges
                challenge_mptr, hash_mptr := squeeze_challenge(challenge_mptr, hash_mptr, r)       // zeta
                challenge_mptr := squeeze_challenge_cont(challenge_mptr, r)                        // nu

                success, proof_cptr, hash_mptr := read_ec_point(success, proof_cptr, hash_mptr, q) // W

                challenge_mptr, hash_mptr := squeeze_challenge(challenge_mptr, hash_mptr, r)       // mu

                success, proof_cptr, hash_mptr := read_ec_point(success, proof_cptr, hash_mptr, q) // W'

                // Load full vk into memory
                mstore(0x0880, 0x2d03d5b50f18862a7338be3e9ccaf0d18526d22a25ce527c6036a7ceff3221c6) // vk_digest
                mstore(0x08a0, 0x0000000000000000000000000000000000000000000000000000000000000001) // num_instances
                mstore(0x08c0, 0x000000000000000000000000000000000000000000000000000000000000000c) // k
                mstore(0x08e0, 0x3061482dfa038d0fb5b4c0b226194047a2616509f531d4fa3acdb77496c10001) // n_inv
                mstore(0x0900, 0x2f6122bbf1d35fdaa9953f60087a423238aa810773efee2a251aa6161f2e6ee6) // omega
                mstore(0x0920, 0x179c2392139def1b24f4e92b4bfba20a0fa885cb6bfc2f2cb92790e00237d0c0) // omega_inv
                mstore(0x0940, 0x28771071ab1633014eae27cfc16d5ebe08a8fe2fc9e85044e4a45f82c14cd825) // omega_inv_to_l
                mstore(0x0960, 0x0000000000000000000000000000000000000000000000000000000000000000) // has_accumulator
                mstore(0x0980, 0x0000000000000000000000000000000000000000000000000000000000000000) // acc_offset
                mstore(0x09a0, 0x0000000000000000000000000000000000000000000000000000000000000000) // num_acc_limbs
                mstore(0x09c0, 0x0000000000000000000000000000000000000000000000000000000000000000) // num_acc_limb_bits
                mstore(0x09e0, 0x0000000000000000000000000000000000000000000000000000000000000001) // g1_x
                mstore(0x0a00, 0x0000000000000000000000000000000000000000000000000000000000000002) // g1_y
                mstore(0x0a20, 0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2) // g2_x_1
                mstore(0x0a40, 0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed) // g2_x_2
                mstore(0x0a60, 0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b) // g2_y_1
                mstore(0x0a80, 0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa) // g2_y_2
                mstore(0x0aa0, 0x2c03942d30286f3ab0a848a1fbaa3dde89ed02d023c88aa07f1837611f57c8cb) // neg_s_g2_x_1
                mstore(0x0ac0, 0x10bae105e6ee9e729a63a1b7d29b2f03d102bbbbf69c7bb018d33c6d0ea5ace5) // neg_s_g2_x_2
                mstore(0x0ae0, 0x1c55ba1859c52a8e728a1bcb4d25d4f7bcc58230fcd983d5539c213019236487) // neg_s_g2_y_1
                mstore(0x0b00, 0x0f8fc215520bc5f52b870192dc9ff676abd8aa7c6de5960e32ff6edfff633986) // neg_s_g2_y_2
                mstore(0x0b20, 0x06af442f19e7b15a916f61dd090e4418105be6d0757d28e7c41ebd75b9c3699e) // fixed_comms[0].x
                mstore(0x0b40, 0x09c65a7100cd779a89448ac5819c1f3181d4aaa27bec91ae9b0337f2a0274ae3) // fixed_comms[0].y
                mstore(0x0b60, 0x1d5676424ddffccf06b2740739f00f6910d196a97434e14f179ac18c828a33d0) // fixed_comms[1].x
                mstore(0x0b80, 0x14fb4c70a5b345cf65b508821ca7922071a03b7af64c99ceeb6ab77af16796a6) // fixed_comms[1].y
                mstore(0x0ba0, 0x18d64a1678b0ab0b0cb6a55548366d5dd5a4a5499afbf75495ae02989118b4ec) // fixed_comms[2].x
                mstore(0x0bc0, 0x0ecfdccf67d9c720838bdb0773f0926908f019ec28bf561ec778de3d40812cff) // fixed_comms[2].y
                mstore(0x0be0, 0x06bc72c915cf9510076d36ddc75106725fb24febe117e3e79d719adb17af936e) // fixed_comms[3].x
                mstore(0x0c00, 0x1a7500652180ca7e8eb3fe15617dc442ae7810d962c076f299b8e417e03c6031) // fixed_comms[3].y
                mstore(0x0c20, 0x21072355c92b757c56e080c37ced31936824bd1b0b53c319cd7d6665e00899f9) // fixed_comms[4].x
                mstore(0x0c40, 0x2c07936a1982e4d2d37ae9cbdd3edb181d58d2fee37077d782f05462c225f792) // fixed_comms[4].y
                mstore(0x0c60, 0x0f85a433cf875eb40f2116fc12974317436c4d7cbc4d6c91b94a01bc26d9ba6c) // fixed_comms[5].x
                mstore(0x0c80, 0x23032cedd6618477d3e4ebf25fb2f9ca8d6c110408bfb5e7b1f4e49d7383bbcb) // fixed_comms[5].y
                mstore(0x0ca0, 0x2b53165dda2a2e340c21bb6309cb531099acecb58f6c932d6cc260dfc14ecdfd) // fixed_comms[6].x
                mstore(0x0cc0, 0x0fee602ca86a24bd8febbd60ada3bdaf74d318993859771f0a6d5d518aa2d729) // fixed_comms[6].y
                mstore(0x0ce0, 0x2771d622378e3e54110cdc64ed4e6c1cc5429b13806772175da8d899a133d62f) // fixed_comms[7].x
                mstore(0x0d00, 0x286bfdd0185aa70caecf2a550b084c582d7e6a71e3971c51709ab8a4218e250f) // fixed_comms[7].y
                mstore(0x0d20, 0x198cd0fdd116b176c4d93ec4379c9d7ef4eb4b5a7c9563f4e9fe7ef9fb3bdb98) // fixed_comms[8].x
                mstore(0x0d40, 0x08add8719d3c31c593b5650b16602b65c88b4302b57763679c03921840eb6c6c) // fixed_comms[8].y
                mstore(0x0d60, 0x2ccc093a23d9875a6032e49f9f8c1b03fa200302ce210a939b92663967f8cdfe) // fixed_comms[9].x
                mstore(0x0d80, 0x0ceaa52af592c3416adf4bb4192bf155fe805b130a129bf94cedfa26f2052f44) // fixed_comms[9].y
                mstore(0x0da0, 0x24d6449fdc9372a42c0ef8fdcb0f0920416d27e1eb7a581d9f38609511f09e71) // fixed_comms[10].x
                mstore(0x0dc0, 0x1b5ac52ac8a4c30a492508f103031724b208becbc6a14e2df2ab7dc8e5e9f073) // fixed_comms[10].y
                mstore(0x0de0, 0x267119f1d8c5dcbc4e32c93971516e190e36f743c17f4d6dcbf47e9fc9251ec8) // fixed_comms[11].x
                mstore(0x0e00, 0x2a85c581c608fc7377df519b18f0c82b6449e862feaf1cf1d99224854f702b97) // fixed_comms[11].y
                mstore(0x0e20, 0x2b650adc7ce4459f70d71dee0d984ae2e2525d690ce1dd7c5b7bb48dd4af51d2) // fixed_comms[12].x
                mstore(0x0e40, 0x29aea9191742bc40eaa149186165bae4c12a69bbc2c85828d9f7ca200714dede) // fixed_comms[12].y
                mstore(0x0e60, 0x1c6d1f4e2d59d50db7b065249d2d2d7ff4083d80a950810b706dca1cbcef12fe) // permutation_comms[0].x
                mstore(0x0e80, 0x2b215b4d1914da3c2839b1ebcfcdd9f7ca31a51c57a4575dba6272b02f22d5ce) // permutation_comms[0].y
                mstore(0x0ea0, 0x1f3470fee245449bce27d63b8d97eb326ad9a048848dd6641464141caf24f46f) // permutation_comms[1].x
                mstore(0x0ec0, 0x1d7da529c8ceccc90c00de2bae1ff96201d7ff12e505bd2df39de995b00a0891) // permutation_comms[1].y
                mstore(0x0ee0, 0x10407f8f05a3a52fff64b24ad5315ceb1e1f1af0469683a5eb80ce8d64d5f54b) // permutation_comms[2].x
                mstore(0x0f00, 0x214717ec7d74905ceac6023da9ad1997f3efc43ff97d455fe8747e479003faa9) // permutation_comms[2].y
                mstore(0x0f20, 0x1f433ea142aabd31be3b905919c8a3bc2e3a91eb3b8fb88849e399ebd0210245) // permutation_comms[3].x
                mstore(0x0f40, 0x107f23105b72b49a7970e5a6f083938cfdf4d00a8f8898b6cb410ddf5cabe489) // permutation_comms[3].y
                mstore(0x0f60, 0x2b4c420d93fc09be08c9780aee103c3e7f390cd01f96ae689165db8e1c779e12) // permutation_comms[4].x
                mstore(0x0f80, 0x1f659e7cdb8401fb3a3a664c38ce0bf7e64f0420a5b02e6081c1c47fab54093c) // permutation_comms[4].y
                mstore(0x0fa0, 0x260821ff981abec18fd6d4ba37eea98269b1df0ad63e10b3938c252010af4640) // permutation_comms[5].x
                mstore(0x0fc0, 0x1d917f0c1326f719adf21a1c7c7115cf01fe5ff1b86d306e0430695eaee7ca3c) // permutation_comms[5].y
                mstore(0x0fe0, 0x2ce1d5e29a0b586bee82aeae92be5422822a6bbc8636cd2c9c7615705cbd9ab6) // permutation_comms[6].x
                mstore(0x1000, 0x19970beb7832ae50fea7b2604f55d86f3fa4f917c73e5645fb97bc69a2b9ab68) // permutation_comms[6].y
                mstore(0x1020, 0x2a4fa528a1b42f41e8be33abbcff7f59d3edce22ee4a09c4e9efab82f42f4b8a) // permutation_comms[7].x
                mstore(0x1040, 0x2e6c5581001cd247c6ba90c8e3e6f3af6a91c1ca4ddf2b0a8d65d74e6105a91e) // permutation_comms[7].y

                // Read accumulator from instances
                if mload(HAS_ACCUMULATOR_MPTR) {
                    let num_limbs := mload(NUM_ACC_LIMBS_MPTR)
                    let num_limb_bits := mload(NUM_ACC_LIMB_BITS_MPTR)

                    let cptr := add(instances.offset, mul(mload(ACC_OFFSET_MPTR), 0x20))
                    let lhs_y_off := mul(num_limbs, 0x20)
                    let rhs_x_off := mul(lhs_y_off, 2)
                    let rhs_y_off := mul(lhs_y_off, 3)
                    let lhs_x := calldataload(cptr)
                    let lhs_y := calldataload(add(cptr, lhs_y_off))
                    let rhs_x := calldataload(add(cptr, rhs_x_off))
                    let rhs_y := calldataload(add(cptr, rhs_y_off))
                    for
                        {
                            let cptr_end := add(cptr, mul(0x20, num_limbs))
                            let shift := num_limb_bits
                        }
                        lt(cptr, cptr_end)
                        {}
                    {
                        cptr := add(cptr, 0x20)
                        lhs_x := add(lhs_x, shl(shift, calldataload(cptr)))
                        lhs_y := add(lhs_y, shl(shift, calldataload(add(cptr, lhs_y_off))))
                        rhs_x := add(rhs_x, shl(shift, calldataload(add(cptr, rhs_x_off))))
                        rhs_y := add(rhs_y, shl(shift, calldataload(add(cptr, rhs_y_off))))
                        shift := add(shift, num_limb_bits)
                    }

                    success := and(success, eq(mulmod(lhs_y, lhs_y, q), addmod(mulmod(lhs_x, mulmod(lhs_x, lhs_x, q), q), 3, q)))
                    success := and(success, eq(mulmod(rhs_y, rhs_y, q), addmod(mulmod(rhs_x, mulmod(rhs_x, rhs_x, q), q), 3, q)))

                    mstore(ACC_LHS_X_MPTR, lhs_x)
                    mstore(ACC_LHS_Y_MPTR, lhs_y)
                    mstore(ACC_RHS_X_MPTR, rhs_x)
                    mstore(ACC_RHS_Y_MPTR, rhs_y)
                }

                pop(q)
            }

            // Revert earlier if anything from calldata is invalid
            if iszero(success) {
                revert(0, 0)
            }

            // Compute lagrange evaluations and instance evaluation
            {
                let k := mload(K_MPTR)
                let x := mload(X_MPTR)
                let x_n := x
                for
                    { let idx := 0 }
                    lt(idx, k)
                    { idx := add(idx, 1) }
                {
                    x_n := mulmod(x_n, x_n, r)
                }

                let omega := mload(OMEGA_MPTR)

                let mptr := X_N_MPTR
                let mptr_end := add(mptr, mul(0x20, add(mload(NUM_INSTANCES_MPTR), 6)))
                if iszero(mload(NUM_INSTANCES_MPTR)) {
                    mptr_end := add(mptr_end, 0x20)
                }
                for
                    { let pow_of_omega := mload(OMEGA_INV_TO_L_MPTR) }
                    lt(mptr, mptr_end)
                    { mptr := add(mptr, 0x20) }
                {
                    mstore(mptr, addmod(x, sub(r, pow_of_omega), r))
                    pow_of_omega := mulmod(pow_of_omega, omega, r)
                }
                let x_n_minus_1 := addmod(x_n, sub(r, 1), r)
                mstore(mptr_end, x_n_minus_1)
                success := batch_invert(success, X_N_MPTR, add(mptr_end, 0x20))

                mptr := X_N_MPTR
                let l_i_common := mulmod(x_n_minus_1, mload(N_INV_MPTR), r)
                for
                    { let pow_of_omega := mload(OMEGA_INV_TO_L_MPTR) }
                    lt(mptr, mptr_end)
                    { mptr := add(mptr, 0x20) }
                {
                    mstore(mptr, mulmod(l_i_common, mulmod(mload(mptr), pow_of_omega, r), r))
                    pow_of_omega := mulmod(pow_of_omega, omega, r)
                }

                let l_blind := mload(add(X_N_MPTR, 0x20))
                let l_i_cptr := add(X_N_MPTR, 0x40)
                for
                    { let l_i_cptr_end := add(X_N_MPTR, 0xc0) }
                    lt(l_i_cptr, l_i_cptr_end)
                    { l_i_cptr := add(l_i_cptr, 0x20) }
                {
                    l_blind := addmod(l_blind, mload(l_i_cptr), r)
                }

                let instance_eval := 0
                for
                    {
                        let instance_cptr := instances.offset
                        let instance_cptr_end := add(instance_cptr, mul(0x20, mload(NUM_INSTANCES_MPTR)))
                    }
                    lt(instance_cptr, instance_cptr_end)
                    {
                        instance_cptr := add(instance_cptr, 0x20)
                        l_i_cptr := add(l_i_cptr, 0x20)
                    }
                {
                    instance_eval := addmod(instance_eval, mulmod(mload(l_i_cptr), calldataload(instance_cptr), r), r)
                }

                let x_n_minus_1_inv := mload(mptr_end)
                let l_last := mload(X_N_MPTR)
                let l_0 := mload(add(X_N_MPTR, 0xc0))

                mstore(X_N_MPTR, x_n)
                mstore(X_N_MINUS_1_INV_MPTR, x_n_minus_1_inv)
                mstore(L_LAST_MPTR, l_last)
                mstore(L_BLIND_MPTR, l_blind)
                mstore(L_0_MPTR, l_0)
                mstore(INSTANCE_EVAL_MPTR, instance_eval)
            }

            // Compute quotient evavluation
            {
                let quotient_eval_numer
                let y := mload(Y_MPTR)
                {
                    let f_11 := calldataload(0x0c64)
                    let var0 := 0x2
                    let var1 := sub(R, f_11)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_11, var2, R)
                    let var4 := 0x3
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x4
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_0 := calldataload(0x0a24)
                    let a_2 := calldataload(0x0a64)
                    let var16 := addmod(a_0, a_2, R)
                    let var17 := sub(R, var16)
                    let var18 := addmod(a_4, var17, R)
                    let var19 := mulmod(var15, var18, R)
                    quotient_eval_numer := var19
                }
                {
                    let f_12 := calldataload(0x0c84)
                    let var0 := 0x2
                    let var1 := sub(R, f_12)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_12, var2, R)
                    let var4 := 0x3
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x4
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_5 := calldataload(0x0ac4)
                    let a_1 := calldataload(0x0a44)
                    let a_3 := calldataload(0x0a84)
                    let var16 := addmod(a_1, a_3, R)
                    let var17 := sub(R, var16)
                    let var18 := addmod(a_5, var17, R)
                    let var19 := mulmod(var15, var18, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var19, r)
                }
                {
                    let f_11 := calldataload(0x0c64)
                    let var0 := 0x1
                    let var1 := sub(R, f_11)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_11, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x4
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_0 := calldataload(0x0a24)
                    let a_2 := calldataload(0x0a64)
                    let var16 := mulmod(a_0, a_2, R)
                    let var17 := sub(R, var16)
                    let var18 := addmod(a_4, var17, R)
                    let var19 := mulmod(var15, var18, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var19, r)
                }
                {
                    let f_12 := calldataload(0x0c84)
                    let var0 := 0x1
                    let var1 := sub(R, f_12)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_12, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x4
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_5 := calldataload(0x0ac4)
                    let a_1 := calldataload(0x0a44)
                    let a_3 := calldataload(0x0a84)
                    let var16 := mulmod(a_1, a_3, R)
                    let var17 := sub(R, var16)
                    let var18 := addmod(a_5, var17, R)
                    let var19 := mulmod(var15, var18, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var19, r)
                }
                {
                    let f_11 := calldataload(0x0c64)
                    let var0 := 0x1
                    let var1 := sub(R, f_11)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_11, var2, R)
                    let var4 := 0x3
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x4
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_0 := calldataload(0x0a24)
                    let a_2 := calldataload(0x0a64)
                    let var16 := sub(R, a_2)
                    let var17 := addmod(a_0, var16, R)
                    let var18 := sub(R, var17)
                    let var19 := addmod(a_4, var18, R)
                    let var20 := mulmod(var15, var19, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var20, r)
                }
                {
                    let f_12 := calldataload(0x0c84)
                    let var0 := 0x1
                    let var1 := sub(R, f_12)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_12, var2, R)
                    let var4 := 0x3
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x4
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_5 := calldataload(0x0ac4)
                    let a_1 := calldataload(0x0a44)
                    let a_3 := calldataload(0x0a84)
                    let var16 := sub(R, a_3)
                    let var17 := addmod(a_1, var16, R)
                    let var18 := sub(R, var17)
                    let var19 := addmod(a_5, var18, R)
                    let var20 := mulmod(var15, var19, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var20, r)
                }
                {
                    let f_11 := calldataload(0x0c64)
                    let var0 := 0x1
                    let var1 := sub(R, f_11)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_11, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x3
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x4
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_4_prev_1 := calldataload(0x0ae4)
                    let var16 := 0x0
                    let a_0 := calldataload(0x0a24)
                    let a_2 := calldataload(0x0a64)
                    let var17 := mulmod(a_0, a_2, R)
                    let var18 := addmod(var16, var17, R)
                    let a_1 := calldataload(0x0a44)
                    let a_3 := calldataload(0x0a84)
                    let var19 := mulmod(a_1, a_3, R)
                    let var20 := addmod(var18, var19, R)
                    let var21 := addmod(a_4_prev_1, var20, R)
                    let var22 := sub(R, var21)
                    let var23 := addmod(a_4, var22, R)
                    let var24 := mulmod(var15, var23, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var24, r)
                }
                {
                    let f_11 := calldataload(0x0c64)
                    let var0 := 0x1
                    let var1 := sub(R, f_11)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_11, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x3
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let var16 := 0x0
                    let a_0 := calldataload(0x0a24)
                    let a_2 := calldataload(0x0a64)
                    let var17 := mulmod(a_0, a_2, R)
                    let var18 := addmod(var16, var17, R)
                    let a_1 := calldataload(0x0a44)
                    let a_3 := calldataload(0x0a84)
                    let var19 := mulmod(a_1, a_3, R)
                    let var20 := addmod(var18, var19, R)
                    let var21 := sub(R, var20)
                    let var22 := addmod(a_4, var21, R)
                    let var23 := mulmod(var15, var22, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var23, r)
                }
                {
                    let f_12 := calldataload(0x0c84)
                    let var0 := 0x1
                    let var1 := sub(R, f_12)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_12, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x3
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x5
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_2 := calldataload(0x0a64)
                    let var16 := mulmod(var0, a_2, R)
                    let a_3 := calldataload(0x0a84)
                    let var17 := mulmod(var16, a_3, R)
                    let var18 := sub(R, var17)
                    let var19 := addmod(a_4, var18, R)
                    let var20 := mulmod(var15, var19, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var20, r)
                }
                {
                    let f_11 := calldataload(0x0c64)
                    let var0 := 0x1
                    let var1 := sub(R, f_11)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_11, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x3
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x4
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x5
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_4_prev_1 := calldataload(0x0ae4)
                    let a_2 := calldataload(0x0a64)
                    let var16 := mulmod(var0, a_2, R)
                    let a_3 := calldataload(0x0a84)
                    let var17 := mulmod(var16, a_3, R)
                    let var18 := mulmod(a_4_prev_1, var17, R)
                    let var19 := sub(R, var18)
                    let var20 := addmod(a_4, var19, R)
                    let var21 := mulmod(var15, var20, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var21, r)
                }
                {
                    let f_12 := calldataload(0x0c84)
                    let var0 := 0x1
                    let var1 := sub(R, f_12)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_12, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x3
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x4
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x5
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let var16 := 0x0
                    let a_2 := calldataload(0x0a64)
                    let var17 := addmod(var16, a_2, R)
                    let a_3 := calldataload(0x0a84)
                    let var18 := addmod(var17, a_3, R)
                    let var19 := sub(R, var18)
                    let var20 := addmod(a_4, var19, R)
                    let var21 := mulmod(var15, var20, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var21, r)
                }
                {
                    let f_12 := calldataload(0x0c84)
                    let var0 := 0x1
                    let var1 := sub(R, f_12)
                    let var2 := addmod(var0, var1, R)
                    let var3 := mulmod(f_12, var2, R)
                    let var4 := 0x2
                    let var5 := addmod(var4, var1, R)
                    let var6 := mulmod(var3, var5, R)
                    let var7 := 0x3
                    let var8 := addmod(var7, var1, R)
                    let var9 := mulmod(var6, var8, R)
                    let var10 := 0x4
                    let var11 := addmod(var10, var1, R)
                    let var12 := mulmod(var9, var11, R)
                    let var13 := 0x6
                    let var14 := addmod(var13, var1, R)
                    let var15 := mulmod(var12, var14, R)
                    let a_4 := calldataload(0x0aa4)
                    let a_4_prev_1 := calldataload(0x0ae4)
                    let var16 := 0x0
                    let a_2 := calldataload(0x0a64)
                    let var17 := addmod(var16, a_2, R)
                    let a_3 := calldataload(0x0a84)
                    let var18 := addmod(var17, a_3, R)
                    let var19 := addmod(a_4_prev_1, var18, R)
                    let var20 := sub(R, var19)
                    let var21 := addmod(a_4, var20, R)
                    let var22 := mulmod(var15, var21, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var22, r)
                }
                {
                    let f_7 := calldataload(0x0be4)
                    let var0 := 0x0
                    let var1 := mulmod(f_7, var0, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var1, r)
                }
                {
                    let f_8 := calldataload(0x0c04)
                    let var0 := 0x0
                    let var1 := mulmod(f_8, var0, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var1, r)
                }
                {
                    let f_9 := calldataload(0x0c24)
                    let var0 := 0x1
                    let a_2 := calldataload(0x0a64)
                    let var1 := 0x0
                    let var2 := sub(R, var1)
                    let var3 := addmod(a_2, var2, R)
                    let var4 := mulmod(var0, var3, R)
                    let var5 := sub(R, var0)
                    let var6 := addmod(a_2, var5, R)
                    let var7 := mulmod(var4, var6, R)
                    let var8 := 0x2
                    let var9 := sub(R, var8)
                    let var10 := addmod(a_2, var9, R)
                    let var11 := mulmod(var7, var10, R)
                    let var12 := 0x3
                    let var13 := sub(R, var12)
                    let var14 := addmod(a_2, var13, R)
                    let var15 := mulmod(var11, var14, R)
                    let var16 := 0x4
                    let var17 := sub(R, var16)
                    let var18 := addmod(a_2, var17, R)
                    let var19 := mulmod(var15, var18, R)
                    let var20 := mulmod(f_9, var19, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var20, r)
                }
                {
                    let f_10 := calldataload(0x0c44)
                    let var0 := 0x1
                    let a_3 := calldataload(0x0a84)
                    let var1 := 0x0
                    let var2 := sub(R, var1)
                    let var3 := addmod(a_3, var2, R)
                    let var4 := mulmod(var0, var3, R)
                    let var5 := sub(R, var0)
                    let var6 := addmod(a_3, var5, R)
                    let var7 := mulmod(var4, var6, R)
                    let var8 := 0x2
                    let var9 := sub(R, var8)
                    let var10 := addmod(a_3, var9, R)
                    let var11 := mulmod(var7, var10, R)
                    let var12 := 0x3
                    let var13 := sub(R, var12)
                    let var14 := addmod(a_3, var13, R)
                    let var15 := mulmod(var11, var14, R)
                    let var16 := 0x4
                    let var17 := sub(R, var16)
                    let var18 := addmod(a_3, var17, R)
                    let var19 := mulmod(var15, var18, R)
                    let var20 := mulmod(f_10, var19, R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), var20, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := addmod(l_0, sub(R, mulmod(l_0, calldataload(0x0dc4), R)), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let perm_z_last := calldataload(0x0e24)
                    let eval := mulmod(mload(L_LAST_MPTR), addmod(mulmod(perm_z_last, perm_z_last, R), sub(R, perm_z_last), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let eval := mulmod(mload(L_0_MPTR), addmod(calldataload(0x0e24), sub(R, calldataload(0x0e04)), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let gamma := mload(GAMMA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let lhs := calldataload(0x0de4)
                    let rhs := calldataload(0x0dc4)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0a24), mulmod(beta, calldataload(0x0cc4), R), R), gamma, R), R)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0a44), mulmod(beta, calldataload(0x0ce4), R), R), gamma, R), R)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0a64), mulmod(beta, calldataload(0x0d04), R), R), gamma, R), R)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0a84), mulmod(beta, calldataload(0x0d24), R), R), gamma, R), R)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0aa4), mulmod(beta, calldataload(0x0d44), R), R), gamma, R), R)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0ac4), mulmod(beta, calldataload(0x0d64), R), R), gamma, R), R)
                    lhs := mulmod(lhs, addmod(addmod(calldataload(0x0b04), mulmod(beta, calldataload(0x0d84), R), R), gamma, R), R)
                    mstore(0x00, mulmod(beta, mload(X_MPTR), R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0a24), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0a44), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0a64), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0a84), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0aa4), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0ac4), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    rhs := mulmod(rhs, addmod(addmod(calldataload(0x0b04), mload(0x00), R), gamma, R), R)
                    mstore(0x00, mulmod(mload(0x00), DELTA, R))
                    let left_sub_right := addmod(lhs, sub(R, rhs), R)
                    let eval := addmod(left_sub_right, sub(R, mulmod(left_sub_right, addmod(mload(L_LAST_MPTR), mload(L_BLIND_MPTR), R), R)), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let gamma := mload(GAMMA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let lhs := calldataload(0x0e44)
                    let rhs := calldataload(0x0e24)
                    lhs := mulmod(lhs, addmod(addmod(mload(INSTANCE_EVAL_MPTR), mulmod(beta, calldataload(0x0da4), R), R), gamma, R), R)
                    rhs := mulmod(rhs, addmod(addmod(mload(INSTANCE_EVAL_MPTR), mload(0x00), R), gamma, R), R)
                    let left_sub_right := addmod(lhs, sub(R, rhs), R)
                    let eval := addmod(left_sub_right, sub(R, mulmod(left_sub_right, addmod(mload(L_LAST_MPTR), mload(L_BLIND_MPTR), R), R)), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x0e64), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x0e64), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_1 := calldataload(0x0b24)
                        table := f_1
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_7 := calldataload(0x0be4)
                        let var0 := 0x1
                        let var1 := mulmod(f_7, var0, R)
                        let a_0 := calldataload(0x0a24)
                        let var2 := mulmod(var1, a_0, R)
                        let var3 := sub(R, var1)
                        let var4 := addmod(var0, var3, R)
                        let var5 := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000
                        let var6 := mulmod(var4, var5, R)
                        let var7 := addmod(var2, var6, R)
                        input_0 := var7
                        input_0 := addmod(input_0, beta, R)
                    }
                    let input_1
                    {
                        let f_8 := calldataload(0x0c04)
                        let var0 := 0x1
                        let var1 := mulmod(f_8, var0, R)
                        let a_1 := calldataload(0x0a44)
                        let var2 := mulmod(var1, a_1, R)
                        let var3 := sub(R, var1)
                        let var4 := addmod(var0, var3, R)
                        let var5 := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000
                        let var6 := mulmod(var4, var5, R)
                        let var7 := addmod(var2, var6, R)
                        input_1 := var7
                        input_1 := addmod(input_1, beta, R)
                    }
                    let lhs
                    let rhs
                    {
                        let tmp := input_1
                        rhs := addmod(rhs, tmp, R)
                    }
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, tmp, R)
                        rhs := mulmod(rhs, table, R)
                    }
                    {
                        let tmp := input_0
                        tmp := mulmod(tmp, input_1, R)
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x0ea4), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x0e84), sub(R, calldataload(0x0e64)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x0ec4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x0ec4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_2 := calldataload(0x0b44)
                        table := f_2
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_9 := calldataload(0x0c24)
                        let var0 := 0x1
                        let a_2 := calldataload(0x0a64)
                        let var1 := sub(R, a_2)
                        let var2 := addmod(var0, var1, R)
                        let var3 := mulmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := 0x2
                        let var6 := addmod(var5, var1, R)
                        let var7 := mulmod(var0, var6, R)
                        let var8 := 0x3
                        let var9 := addmod(var8, var1, R)
                        let var10 := mulmod(var0, var9, R)
                        let var11 := 0x4
                        let var12 := addmod(var11, var1, R)
                        let var13 := mulmod(var0, var12, R)
                        let var14 := mulmod(var10, var13, R)
                        let var15 := mulmod(var7, var14, R)
                        let var16 := mulmod(var4, var15, R)
                        let var17 := mulmod(f_9, var16, R)
                        let a_0 := calldataload(0x0a24)
                        let var18 := mulmod(var17, a_0, R)
                        let var19 := 0x18
                        let var20 := sub(R, var17)
                        let var21 := addmod(var19, var20, R)
                        let var22 := 0x0
                        let var23 := mulmod(var21, var22, R)
                        let var24 := addmod(var18, var23, R)
                        input_0 := var24
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x0f04), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x0ee4), sub(R, calldataload(0x0ec4)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x0f24), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x0f24), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_2 := calldataload(0x0b44)
                        table := f_2
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_10 := calldataload(0x0c44)
                        let var0 := 0x1
                        let a_3 := calldataload(0x0a84)
                        let var1 := sub(R, a_3)
                        let var2 := addmod(var0, var1, R)
                        let var3 := mulmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := 0x2
                        let var6 := addmod(var5, var1, R)
                        let var7 := mulmod(var0, var6, R)
                        let var8 := 0x3
                        let var9 := addmod(var8, var1, R)
                        let var10 := mulmod(var0, var9, R)
                        let var11 := 0x4
                        let var12 := addmod(var11, var1, R)
                        let var13 := mulmod(var0, var12, R)
                        let var14 := mulmod(var10, var13, R)
                        let var15 := mulmod(var7, var14, R)
                        let var16 := mulmod(var4, var15, R)
                        let var17 := mulmod(f_10, var16, R)
                        let a_1 := calldataload(0x0a44)
                        let var18 := mulmod(var17, a_1, R)
                        let var19 := 0x18
                        let var20 := sub(R, var17)
                        let var21 := addmod(var19, var20, R)
                        let var22 := 0x0
                        let var23 := mulmod(var21, var22, R)
                        let var24 := addmod(var18, var23, R)
                        input_0 := var24
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x0f64), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x0f44), sub(R, calldataload(0x0f24)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x0f84), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x0f84), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_3 := calldataload(0x0b64)
                        table := f_3
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_9 := calldataload(0x0c24)
                        let var0 := 0x1
                        let a_2 := calldataload(0x0a64)
                        let var1 := mulmod(var0, a_2, R)
                        let var2 := mulmod(var1, var0, R)
                        let var3 := 0x2
                        let var4 := sub(R, a_2)
                        let var5 := addmod(var3, var4, R)
                        let var6 := mulmod(var0, var5, R)
                        let var7 := 0x3
                        let var8 := addmod(var7, var4, R)
                        let var9 := mulmod(var0, var8, R)
                        let var10 := 0x4
                        let var11 := addmod(var10, var4, R)
                        let var12 := mulmod(var0, var11, R)
                        let var13 := mulmod(var9, var12, R)
                        let var14 := mulmod(var6, var13, R)
                        let var15 := mulmod(var2, var14, R)
                        let var16 := mulmod(f_9, var15, R)
                        let a_0 := calldataload(0x0a24)
                        let var17 := mulmod(var16, a_0, R)
                        let var18 := 0x6
                        let var19 := sub(R, var16)
                        let var20 := addmod(var18, var19, R)
                        let var21 := 0xff8
                        let var22 := mulmod(var20, var21, R)
                        let var23 := addmod(var17, var22, R)
                        input_0 := var23
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x0fc4), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x0fa4), sub(R, calldataload(0x0f84)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x0fe4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x0fe4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_3 := calldataload(0x0b64)
                        table := f_3
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_10 := calldataload(0x0c44)
                        let var0 := 0x1
                        let a_3 := calldataload(0x0a84)
                        let var1 := mulmod(var0, a_3, R)
                        let var2 := mulmod(var1, var0, R)
                        let var3 := 0x2
                        let var4 := sub(R, a_3)
                        let var5 := addmod(var3, var4, R)
                        let var6 := mulmod(var0, var5, R)
                        let var7 := 0x3
                        let var8 := addmod(var7, var4, R)
                        let var9 := mulmod(var0, var8, R)
                        let var10 := 0x4
                        let var11 := addmod(var10, var4, R)
                        let var12 := mulmod(var0, var11, R)
                        let var13 := mulmod(var9, var12, R)
                        let var14 := mulmod(var6, var13, R)
                        let var15 := mulmod(var2, var14, R)
                        let var16 := mulmod(f_10, var15, R)
                        let a_1 := calldataload(0x0a44)
                        let var17 := mulmod(var16, a_1, R)
                        let var18 := 0x6
                        let var19 := sub(R, var16)
                        let var20 := addmod(var18, var19, R)
                        let var21 := 0xff8
                        let var22 := mulmod(var20, var21, R)
                        let var23 := addmod(var17, var22, R)
                        input_0 := var23
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x1024), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x1004), sub(R, calldataload(0x0fe4)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x1044), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x1044), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_4 := calldataload(0x0b84)
                        table := f_4
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_9 := calldataload(0x0c24)
                        let var0 := 0x1
                        let a_2 := calldataload(0x0a64)
                        let var1 := mulmod(var0, a_2, R)
                        let var2 := sub(R, a_2)
                        let var3 := addmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := mulmod(var1, var4, R)
                        let var6 := 0x3
                        let var7 := addmod(var6, var2, R)
                        let var8 := mulmod(var0, var7, R)
                        let var9 := 0x4
                        let var10 := addmod(var9, var2, R)
                        let var11 := mulmod(var0, var10, R)
                        let var12 := mulmod(var8, var11, R)
                        let var13 := mulmod(var0, var12, R)
                        let var14 := mulmod(var5, var13, R)
                        let var15 := mulmod(f_9, var14, R)
                        let a_0 := calldataload(0x0a24)
                        let var16 := mulmod(var15, a_0, R)
                        let var17 := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffffd
                        let var18 := sub(R, var15)
                        let var19 := addmod(var17, var18, R)
                        let var20 := 0x1ff0
                        let var21 := mulmod(var19, var20, R)
                        let var22 := addmod(var16, var21, R)
                        input_0 := var22
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x1084), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x1064), sub(R, calldataload(0x1044)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x10a4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x10a4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_4 := calldataload(0x0b84)
                        table := f_4
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_10 := calldataload(0x0c44)
                        let var0 := 0x1
                        let a_3 := calldataload(0x0a84)
                        let var1 := mulmod(var0, a_3, R)
                        let var2 := sub(R, a_3)
                        let var3 := addmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := mulmod(var1, var4, R)
                        let var6 := 0x3
                        let var7 := addmod(var6, var2, R)
                        let var8 := mulmod(var0, var7, R)
                        let var9 := 0x4
                        let var10 := addmod(var9, var2, R)
                        let var11 := mulmod(var0, var10, R)
                        let var12 := mulmod(var8, var11, R)
                        let var13 := mulmod(var0, var12, R)
                        let var14 := mulmod(var5, var13, R)
                        let var15 := mulmod(f_10, var14, R)
                        let a_1 := calldataload(0x0a44)
                        let var16 := mulmod(var15, a_1, R)
                        let var17 := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffffd
                        let var18 := sub(R, var15)
                        let var19 := addmod(var17, var18, R)
                        let var20 := 0x1ff0
                        let var21 := mulmod(var19, var20, R)
                        let var22 := addmod(var16, var21, R)
                        input_0 := var22
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x10e4), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x10c4), sub(R, calldataload(0x10a4)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x1104), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x1104), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_5 := calldataload(0x0ba4)
                        table := f_5
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_9 := calldataload(0x0c24)
                        let var0 := 0x1
                        let a_2 := calldataload(0x0a64)
                        let var1 := mulmod(var0, a_2, R)
                        let var2 := sub(R, a_2)
                        let var3 := addmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := mulmod(var1, var4, R)
                        let var6 := 0x2
                        let var7 := addmod(var6, var2, R)
                        let var8 := mulmod(var0, var7, R)
                        let var9 := 0x4
                        let var10 := addmod(var9, var2, R)
                        let var11 := mulmod(var0, var10, R)
                        let var12 := mulmod(var0, var11, R)
                        let var13 := mulmod(var8, var12, R)
                        let var14 := mulmod(var5, var13, R)
                        let var15 := mulmod(f_9, var14, R)
                        let a_0 := calldataload(0x0a24)
                        let var16 := mulmod(var15, a_0, R)
                        let var17 := 0x6
                        let var18 := sub(R, var15)
                        let var19 := addmod(var17, var18, R)
                        let var20 := 0x2fe8
                        let var21 := mulmod(var19, var20, R)
                        let var22 := addmod(var16, var21, R)
                        input_0 := var22
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x1144), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x1124), sub(R, calldataload(0x1104)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x1164), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x1164), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_5 := calldataload(0x0ba4)
                        table := f_5
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_10 := calldataload(0x0c44)
                        let var0 := 0x1
                        let a_3 := calldataload(0x0a84)
                        let var1 := mulmod(var0, a_3, R)
                        let var2 := sub(R, a_3)
                        let var3 := addmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := mulmod(var1, var4, R)
                        let var6 := 0x2
                        let var7 := addmod(var6, var2, R)
                        let var8 := mulmod(var0, var7, R)
                        let var9 := 0x4
                        let var10 := addmod(var9, var2, R)
                        let var11 := mulmod(var0, var10, R)
                        let var12 := mulmod(var0, var11, R)
                        let var13 := mulmod(var8, var12, R)
                        let var14 := mulmod(var5, var13, R)
                        let var15 := mulmod(f_10, var14, R)
                        let a_1 := calldataload(0x0a44)
                        let var16 := mulmod(var15, a_1, R)
                        let var17 := 0x6
                        let var18 := sub(R, var15)
                        let var19 := addmod(var17, var18, R)
                        let var20 := 0x2fe8
                        let var21 := mulmod(var19, var20, R)
                        let var22 := addmod(var16, var21, R)
                        input_0 := var22
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x11a4), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x1184), sub(R, calldataload(0x1164)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x11c4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x11c4), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_6 := calldataload(0x0bc4)
                        table := f_6
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_9 := calldataload(0x0c24)
                        let var0 := 0x1
                        let a_2 := calldataload(0x0a64)
                        let var1 := mulmod(var0, a_2, R)
                        let var2 := sub(R, a_2)
                        let var3 := addmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := mulmod(var1, var4, R)
                        let var6 := 0x2
                        let var7 := addmod(var6, var2, R)
                        let var8 := mulmod(var0, var7, R)
                        let var9 := 0x3
                        let var10 := addmod(var9, var2, R)
                        let var11 := mulmod(var0, var10, R)
                        let var12 := mulmod(var11, var0, R)
                        let var13 := mulmod(var8, var12, R)
                        let var14 := mulmod(var5, var13, R)
                        let var15 := mulmod(f_9, var14, R)
                        let a_0 := calldataload(0x0a24)
                        let var16 := mulmod(var15, a_0, R)
                        let var17 := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffe9
                        let var18 := sub(R, var15)
                        let var19 := addmod(var17, var18, R)
                        let var20 := 0x3fe0
                        let var21 := mulmod(var19, var20, R)
                        let var22 := addmod(var16, var21, R)
                        input_0 := var22
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x1204), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x11e4), sub(R, calldataload(0x11c4)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_0 := mload(L_0_MPTR)
                    let eval := mulmod(l_0, calldataload(0x1224), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let l_last := mload(L_LAST_MPTR)
                    let eval := mulmod(l_last, calldataload(0x1224), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }
                {
                    let theta := mload(THETA_MPTR)
                    let beta := mload(BETA_MPTR)
                    let table
                    {
                        let f_6 := calldataload(0x0bc4)
                        table := f_6
                        table := addmod(table, beta, R)
                    }
                    let input_0
                    {
                        let f_10 := calldataload(0x0c44)
                        let var0 := 0x1
                        let a_3 := calldataload(0x0a84)
                        let var1 := mulmod(var0, a_3, R)
                        let var2 := sub(R, a_3)
                        let var3 := addmod(var0, var2, R)
                        let var4 := mulmod(var0, var3, R)
                        let var5 := mulmod(var1, var4, R)
                        let var6 := 0x2
                        let var7 := addmod(var6, var2, R)
                        let var8 := mulmod(var0, var7, R)
                        let var9 := 0x3
                        let var10 := addmod(var9, var2, R)
                        let var11 := mulmod(var0, var10, R)
                        let var12 := mulmod(var11, var0, R)
                        let var13 := mulmod(var8, var12, R)
                        let var14 := mulmod(var5, var13, R)
                        let var15 := mulmod(f_10, var14, R)
                        let a_1 := calldataload(0x0a44)
                        let var16 := mulmod(var15, a_1, R)
                        let var17 := 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffe9
                        let var18 := sub(R, var15)
                        let var19 := addmod(var17, var18, R)
                        let var20 := 0x3fe0
                        let var21 := mulmod(var19, var20, R)
                        let var22 := addmod(var16, var21, R)
                        input_0 := var22
                        input_0 := addmod(input_0, beta, R)
                    }
                    let lhs
                    let rhs
                    rhs := table
                    {
                        let tmp := input_0
                        rhs := addmod(rhs, sub(R, mulmod(calldataload(0x1264), tmp, R)), R)
                        lhs := mulmod(mulmod(table, tmp, R), addmod(calldataload(0x1244), sub(R, calldataload(0x1224)), R), R)
                    }
                    let eval := mulmod(addmod(1, sub(R, addmod(mload(L_BLIND_MPTR), mload(L_LAST_MPTR), R)), R), addmod(lhs, sub(R, rhs), R), R)
                    quotient_eval_numer := addmod(mulmod(quotient_eval_numer, y, r), eval, r)
                }

                pop(y)

                let quotient_eval := mulmod(quotient_eval_numer, mload(X_N_MINUS_1_INV_MPTR), r)
                mstore(QUOTIENT_EVAL_MPTR, quotient_eval)
            }

            // Compute quotient commitment
            {
                mstore(0x00, calldataload(LAST_QUOTIENT_X_CPTR))
                mstore(0x20, calldataload(add(LAST_QUOTIENT_X_CPTR, 0x20)))
                let x_n := mload(X_N_MPTR)
                for
                    {
                        let cptr := sub(LAST_QUOTIENT_X_CPTR, 0x40)
                        let cptr_end := sub(FIRST_QUOTIENT_X_CPTR, 0x40)
                    }
                    lt(cptr_end, cptr)
                    {}
                {
                    success := ec_mul_acc(success, x_n)
                    success := ec_add_acc(success, calldataload(cptr), calldataload(add(cptr, 0x20)))
                    cptr := sub(cptr, 0x40)
                }
                mstore(QUOTIENT_X_MPTR, mload(0x00))
                mstore(QUOTIENT_Y_MPTR, mload(0x20))
            }

            // Compute pairing lhs and rhs
            {
                {
                    let x := mload(X_MPTR)
                    let omega := mload(OMEGA_MPTR)
                    let omega_inv := mload(OMEGA_INV_MPTR)
                    let x_pow_of_omega := mulmod(x, omega, R)
                    mstore(0x0360, x_pow_of_omega)
                    mstore(0x0340, x)
                    x_pow_of_omega := mulmod(x, omega_inv, R)
                    mstore(0x0320, x_pow_of_omega)
                    x_pow_of_omega := mulmod(x_pow_of_omega, omega_inv, R)
                    x_pow_of_omega := mulmod(x_pow_of_omega, omega_inv, R)
                    x_pow_of_omega := mulmod(x_pow_of_omega, omega_inv, R)
                    x_pow_of_omega := mulmod(x_pow_of_omega, omega_inv, R)
                    x_pow_of_omega := mulmod(x_pow_of_omega, omega_inv, R)
                    mstore(0x0300, x_pow_of_omega)
                }
                {
                    let mu := mload(MU_MPTR)
                    for
                        {
                            let mptr := 0x0380
                            let mptr_end := 0x0400
                            let point_mptr := 0x0300
                        }
                        lt(mptr, mptr_end)
                        {
                            mptr := add(mptr, 0x20)
                            point_mptr := add(point_mptr, 0x20)
                        }
                    {
                        mstore(mptr, addmod(mu, sub(R, mload(point_mptr)), R))
                    }
                    let s
                    s := mload(0x03c0)
                    mstore(0x0400, s)
                    let diff
                    diff := mload(0x0380)
                    diff := mulmod(diff, mload(0x03a0), R)
                    diff := mulmod(diff, mload(0x03e0), R)
                    mstore(0x0420, diff)
                    mstore(0x00, diff)
                    diff := mload(0x0380)
                    diff := mulmod(diff, mload(0x03e0), R)
                    mstore(0x0440, diff)
                    diff := mload(0x03a0)
                    mstore(0x0460, diff)
                    diff := mload(0x0380)
                    diff := mulmod(diff, mload(0x03a0), R)
                    mstore(0x0480, diff)
                }
                {
                    let point_2 := mload(0x0340)
                    let coeff
                    coeff := 1
                    coeff := mulmod(coeff, mload(0x03c0), R)
                    mstore(0x20, coeff)
                }
                {
                    let point_1 := mload(0x0320)
                    let point_2 := mload(0x0340)
                    let coeff
                    coeff := addmod(point_1, sub(R, point_2), R)
                    coeff := mulmod(coeff, mload(0x03a0), R)
                    mstore(0x40, coeff)
                    coeff := addmod(point_2, sub(R, point_1), R)
                    coeff := mulmod(coeff, mload(0x03c0), R)
                    mstore(0x60, coeff)
                }
                {
                    let point_0 := mload(0x0300)
                    let point_2 := mload(0x0340)
                    let point_3 := mload(0x0360)
                    let coeff
                    coeff := addmod(point_0, sub(R, point_2), R)
                    coeff := mulmod(coeff, addmod(point_0, sub(R, point_3), R), R)
                    coeff := mulmod(coeff, mload(0x0380), R)
                    mstore(0x80, coeff)
                    coeff := addmod(point_2, sub(R, point_0), R)
                    coeff := mulmod(coeff, addmod(point_2, sub(R, point_3), R), R)
                    coeff := mulmod(coeff, mload(0x03c0), R)
                    mstore(0xa0, coeff)
                    coeff := addmod(point_3, sub(R, point_0), R)
                    coeff := mulmod(coeff, addmod(point_3, sub(R, point_2), R), R)
                    coeff := mulmod(coeff, mload(0x03e0), R)
                    mstore(0xc0, coeff)
                }
                {
                    let point_2 := mload(0x0340)
                    let point_3 := mload(0x0360)
                    let coeff
                    coeff := addmod(point_2, sub(R, point_3), R)
                    coeff := mulmod(coeff, mload(0x03c0), R)
                    mstore(0xe0, coeff)
                    coeff := addmod(point_3, sub(R, point_2), R)
                    coeff := mulmod(coeff, mload(0x03e0), R)
                    mstore(0x0100, coeff)
                }
                {
                    success := batch_invert(success, 0, 0x0120)
                    let diff_0_inv := mload(0x00)
                    mstore(0x0420, diff_0_inv)
                    for
                        {
                            let mptr := 0x0440
                            let mptr_end := 0x04a0
                        }
                        lt(mptr, mptr_end)
                        { mptr := add(mptr, 0x20) }
                    {
                        mstore(mptr, mulmod(mload(mptr), diff_0_inv, R))
                    }
                }
                {
                    let coeff := mload(0x20)
                    let zeta := mload(ZETA_MPTR)
                    let r_eval := 0
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x0ca4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, mload(QUOTIENT_EVAL_MPTR), R), R)
                    for
                        {
                            let mptr := 0x0da4
                            let mptr_end := 0x0ca4
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x20) }
                    {
                        r_eval := addmod(mulmod(r_eval, zeta, R), mulmod(coeff, calldataload(mptr), R), R)
                    }
                    for
                        {
                            let mptr := 0x0c84
                            let mptr_end := 0x0ae4
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x20) }
                    {
                        r_eval := addmod(mulmod(r_eval, zeta, R), mulmod(coeff, calldataload(mptr), R), R)
                    }
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x1264), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x1204), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x11a4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x1144), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x10e4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x1084), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x1024), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x0fc4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x0f64), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x0f04), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x0ea4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(coeff, calldataload(0x0ac4), R), R)
                    for
                        {
                            let mptr := 0x0a84
                            let mptr_end := 0x0a04
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x20) }
                    {
                        r_eval := addmod(mulmod(r_eval, zeta, R), mulmod(coeff, calldataload(mptr), R), R)
                    }
                    mstore(0x04a0, r_eval)
                }
                {
                    let zeta := mload(ZETA_MPTR)
                    let r_eval := 0
                    r_eval := addmod(r_eval, mulmod(mload(0x40), calldataload(0x0ae4), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x60), calldataload(0x0aa4), R), R)
                    r_eval := mulmod(r_eval, mload(0x0440), R)
                    mstore(0x04c0, r_eval)
                }
                {
                    let zeta := mload(ZETA_MPTR)
                    let r_eval := 0
                    r_eval := addmod(r_eval, mulmod(mload(0x80), calldataload(0x0e04), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0xa0), calldataload(0x0dc4), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0xc0), calldataload(0x0de4), R), R)
                    r_eval := mulmod(r_eval, mload(0x0460), R)
                    mstore(0x04e0, r_eval)
                }
                {
                    let zeta := mload(ZETA_MPTR)
                    let r_eval := 0
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x1224), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x1244), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x11c4), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x11e4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x1164), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x1184), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x1104), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x1124), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x10a4), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x10c4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x1044), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x1064), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x0fe4), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x1004), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x0f84), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x0fa4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x0f24), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x0f44), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x0ec4), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x0ee4), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x0e64), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x0e84), R), R)
                    r_eval := mulmod(r_eval, zeta, R)
                    r_eval := addmod(r_eval, mulmod(mload(0xe0), calldataload(0x0e24), R), R)
                    r_eval := addmod(r_eval, mulmod(mload(0x0100), calldataload(0x0e44), R), R)
                    r_eval := mulmod(r_eval, mload(0x0480), R)
                    mstore(0x0500, r_eval)
                }
                {
                    let sum := mload(0x20)
                    mstore(0x0520, sum)
                }
                {
                    let sum := mload(0x40)
                    sum := addmod(sum, mload(0x60), R)
                    mstore(0x0540, sum)
                }
                {
                    let sum := mload(0x80)
                    sum := addmod(sum, mload(0xa0), R)
                    sum := addmod(sum, mload(0xc0), R)
                    mstore(0x0560, sum)
                }
                {
                    let sum := mload(0xe0)
                    sum := addmod(sum, mload(0x0100), R)
                    mstore(0x0580, sum)
                }
                {
                    for
                        {
                            let mptr := 0x00
                            let mptr_end := 0x80
                            let sum_mptr := 0x0520
                        }
                        lt(mptr, mptr_end)
                        {
                            mptr := add(mptr, 0x20)
                            sum_mptr := add(sum_mptr, 0x20)
                        }
                    {
                        mstore(mptr, mload(sum_mptr))
                    }
                    success := batch_invert(success, 0, 0x80)
                    let r_eval := mulmod(mload(0x60), mload(0x0500), R)
                    for
                        {
                            let sum_inv_mptr := 0x40
                            let sum_inv_mptr_end := 0x80
                            let r_eval_mptr := 0x04e0
                        }
                        lt(sum_inv_mptr, sum_inv_mptr_end)
                        {
                            sum_inv_mptr := sub(sum_inv_mptr, 0x20)
                            r_eval_mptr := sub(r_eval_mptr, 0x20)
                        }
                    {
                        r_eval := mulmod(r_eval, mload(NU_MPTR), R)
                        r_eval := addmod(r_eval, mulmod(mload(sum_inv_mptr), mload(r_eval_mptr), R), R)
                    }
                    mstore(R_EVAL_MPTR, r_eval)
                }
                {
                    let nu := mload(NU_MPTR)
                    mstore(0x00, calldataload(0x07e4))
                    mstore(0x20, calldataload(0x0804))
                    success := ec_mul_acc(success, mload(ZETA_MPTR))
                    success := ec_add_acc(success, mload(QUOTIENT_X_MPTR), mload(QUOTIENT_Y_MPTR))
                    for
                        {
                            let mptr := 0x1020
                            let mptr_end := 0x0ae0
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x40) }
                    {
                        success := ec_mul_acc(success, mload(ZETA_MPTR))
                        success := ec_add_acc(success, mload(mptr), mload(add(mptr, 0x20)))
                    }
                    for
                        {
                            let mptr := 0x0464
                            let mptr_end := 0x0164
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x40) }
                    {
                        success := ec_mul_acc(success, mload(ZETA_MPTR))
                        success := ec_add_acc(success, calldataload(mptr), calldataload(add(mptr, 0x20)))
                    }
                    for
                        {
                            let mptr := 0x0124
                            let mptr_end := 0x24
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x40) }
                    {
                        success := ec_mul_acc(success, mload(ZETA_MPTR))
                        success := ec_add_acc(success, calldataload(mptr), calldataload(add(mptr, 0x20)))
                    }
                    mstore(0x80, calldataload(0x0164))
                    mstore(0xa0, calldataload(0x0184))
                    success := ec_mul_tmp(success, mulmod(nu, mload(0x0440), R))
                    success := ec_add_acc(success, mload(0x80), mload(0xa0))
                    nu := mulmod(nu, mload(NU_MPTR), R)
                    mstore(0x80, calldataload(0x04a4))
                    mstore(0xa0, calldataload(0x04c4))
                    success := ec_mul_tmp(success, mulmod(nu, mload(0x0460), R))
                    success := ec_add_acc(success, mload(0x80), mload(0xa0))
                    nu := mulmod(nu, mload(NU_MPTR), R)
                    mstore(0x80, calldataload(0x07a4))
                    mstore(0xa0, calldataload(0x07c4))
                    for
                        {
                            let mptr := 0x0764
                            let mptr_end := 0x04a4
                        }
                        lt(mptr_end, mptr)
                        { mptr := sub(mptr, 0x40) }
                    {
                        success := ec_mul_tmp(success, mload(ZETA_MPTR))
                        success := ec_add_tmp(success, calldataload(mptr), calldataload(add(mptr, 0x20)))
                    }
                    success := ec_mul_tmp(success, mulmod(nu, mload(0x0480), R))
                    success := ec_add_acc(success, mload(0x80), mload(0xa0))
                    mstore(0x80, mload(G1_X_MPTR))
                    mstore(0xa0, mload(G1_Y_MPTR))
                    success := ec_mul_tmp(success, sub(R, mload(R_EVAL_MPTR)))
                    success := ec_add_acc(success, mload(0x80), mload(0xa0))
                    mstore(0x80, calldataload(0x1284))
                    mstore(0xa0, calldataload(0x12a4))
                    success := ec_mul_tmp(success, sub(R, mload(0x0400)))
                    success := ec_add_acc(success, mload(0x80), mload(0xa0))
                    mstore(0x80, calldataload(0x12c4))
                    mstore(0xa0, calldataload(0x12e4))
                    success := ec_mul_tmp(success, mload(MU_MPTR))
                    success := ec_add_acc(success, mload(0x80), mload(0xa0))
                    mstore(PAIRING_LHS_X_MPTR, mload(0x00))
                    mstore(PAIRING_LHS_Y_MPTR, mload(0x20))
                    mstore(PAIRING_RHS_X_MPTR, calldataload(0x12c4))
                    mstore(PAIRING_RHS_Y_MPTR, calldataload(0x12e4))
                }
            }

            // Random linear combine with accumulator
            if mload(HAS_ACCUMULATOR_MPTR) {
                mstore(0x00, mload(ACC_LHS_X_MPTR))
                mstore(0x20, mload(ACC_LHS_Y_MPTR))
                mstore(0x40, mload(ACC_RHS_X_MPTR))
                mstore(0x60, mload(ACC_RHS_Y_MPTR))
                mstore(0x80, mload(PAIRING_LHS_X_MPTR))
                mstore(0xa0, mload(PAIRING_LHS_Y_MPTR))
                mstore(0xc0, mload(PAIRING_RHS_X_MPTR))
                mstore(0xe0, mload(PAIRING_RHS_Y_MPTR))
                let challenge := mod(keccak256(0x00, 0x100), r)

                // [pairing_lhs] += challenge * [acc_lhs]
                success := ec_mul_acc(success, challenge)
                success := ec_add_acc(success, mload(PAIRING_LHS_X_MPTR), mload(PAIRING_LHS_Y_MPTR))
                mstore(PAIRING_LHS_X_MPTR, mload(0x00))
                mstore(PAIRING_LHS_Y_MPTR, mload(0x20))

                // [pairing_rhs] += challenge * [acc_rhs]
                mstore(0x00, mload(ACC_RHS_X_MPTR))
                mstore(0x20, mload(ACC_RHS_Y_MPTR))
                success := ec_mul_acc(success, challenge)
                success := ec_add_acc(success, mload(PAIRING_RHS_X_MPTR), mload(PAIRING_RHS_Y_MPTR))
                mstore(PAIRING_RHS_X_MPTR, mload(0x00))
                mstore(PAIRING_RHS_Y_MPTR, mload(0x20))
            }

            // Perform pairing
            success := ec_pairing(
                success,
                mload(PAIRING_LHS_X_MPTR),
                mload(PAIRING_LHS_Y_MPTR),
                mload(PAIRING_RHS_X_MPTR),
                mload(PAIRING_RHS_Y_MPTR)
            )

            // Revert if anything fails
            if iszero(success) {
                revert(0x00, 0x00)
            }

            // Return 1 as result if everything succeeds
            mstore(0x00, 1)
            return(0x00, 0x20)
        }
    }
}