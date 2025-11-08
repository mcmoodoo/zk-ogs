// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title SenderRelayLibrary
/// @notice Library for encoding and decoding the original sender address and commitment hash in hookData
/// @dev Uses encoding scheme: [20 bytes: sender][32 bytes: commitment hash][original hookData]
library SenderRelayLibrary {
    uint256 private constant SENDER_OFFSET = 0;
    uint256 private constant SENDER_LENGTH = 20;
    uint256 private constant COMMITMENT_OFFSET = 20;
    uint256 private constant COMMITMENT_LENGTH = 32;
    uint256 private constant MIN_ENCODED_LENGTH = SENDER_LENGTH + COMMITMENT_LENGTH; // 52 bytes

    /// @notice Encodes the original sender address and commitment hash into hookData
    /// @param sender The original sender address to encode
    /// @param commitmentHash The 256-bit commitment hash to encode (bytes32)
    /// @param originalHookData The original hookData to append
    /// @return encodedHookData The encoded hookData with sender and commitment prepended
    function encodeWithSenderAndCommitment(
        address sender,
        bytes32 commitmentHash,
        bytes calldata originalHookData
    ) internal pure returns (bytes memory encodedHookData) {
        // Encode: [20 bytes sender][32 bytes commitment][original hookData]
        encodedHookData = new bytes(MIN_ENCODED_LENGTH + originalHookData.length);
        assembly {
            let dataPtr := add(encodedHookData, 0x20)
            // Copy sender address (20 bytes) to the beginning
            mstore(dataPtr, shl(96, sender))
            // Copy commitment hash (32 bytes) after the sender (offset 20)
            mstore(add(dataPtr, 20), commitmentHash)
            // Copy original hookData after the commitment (offset 52 = 20 + 32)
            calldatacopy(add(dataPtr, 52), originalHookData.offset, originalHookData.length)
        }
    }

    /// @notice Encodes only the original sender address into hookData (backward compatibility)
    /// @param sender The original sender address to encode
    /// @param originalHookData The original hookData to append
    /// @return encodedHookData The encoded hookData with sender prepended
    function encodeWithSender(address sender, bytes calldata originalHookData)
        internal
        pure
        returns (bytes memory encodedHookData)
    {
        // Encode with zero commitment hash for backward compatibility
        return encodeWithSenderAndCommitment(sender, bytes32(0), originalHookData);
    }

    /// @notice Decodes the original sender address and commitment hash from hookData
    /// @param hookData The hookData that may contain encoded sender and commitment
    /// @return originalSender The original sender address (address(0) if not encoded)
    /// @return commitmentHash The commitment hash (bytes32(0) if not encoded)
    /// @return remainingHookData The remaining hookData after removing sender and commitment
    function decodeSenderAndCommitment(bytes calldata hookData)
        internal
        pure
        returns (address originalSender, bytes32 commitmentHash, bytes calldata remainingHookData)
    {
        // Check if hookData has at least the minimum encoded length (52 bytes)
        if (hookData.length >= MIN_ENCODED_LENGTH) {
            // Extract the sender address (first 20 bytes)
            assembly {
                originalSender := shr(96, calldataload(hookData.offset))
            }
            // Extract the commitment hash (next 32 bytes, offset 20)
            // calldataload reads 32 bytes starting from the offset, which gives us bytes 20-51
            assembly {
                commitmentHash := calldataload(add(hookData.offset, 20))
            }
            // Return the remaining hookData (everything after the first 52 bytes)
            remainingHookData = hookData[MIN_ENCODED_LENGTH:];
        } else if (hookData.length >= SENDER_LENGTH) {
            // Backward compatibility: only sender encoded (old format)
            assembly {
                originalSender := shr(96, calldataload(hookData.offset))
            }
            commitmentHash = bytes32(0);
            remainingHookData = hookData[SENDER_LENGTH:];
        } else {
            // No encoding found
            originalSender = address(0);
            commitmentHash = bytes32(0);
            remainingHookData = hookData;
        }
    }

    /// @notice Decodes only the original sender address from hookData (backward compatibility)
    /// @param hookData The hookData that may contain an encoded sender
    /// @return originalSender The original sender address (address(0) if not encoded)
    /// @return remainingHookData The remaining hookData after removing the sender
    function decodeSender(bytes calldata hookData)
        internal
        pure
        returns (address originalSender, bytes calldata remainingHookData)
    {
        bytes32 commitmentHash;
        (originalSender, commitmentHash, remainingHookData) = decodeSenderAndCommitment(hookData);
        // Note: commitmentHash is ignored in this backward-compatible function
    }

    /// @notice Checks if hookData contains encoded sender and commitment
    /// @param hookData The hookData to check
    /// @return hasData True if hookData contains encoded sender and commitment
    function hasEncodedData(bytes calldata hookData) internal pure returns (bool hasData) {
        return hookData.length >= MIN_ENCODED_LENGTH;
    }
}
