// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TruthOracle — on-chain anchor for AgentVAR rulings
/// @notice The Arbiter agent records each final ruling here after the jury of
///         AI agents reaches a 2/3 majority off-chain. Downstream contracts
///         (e.g. ParametricPool) read adjudicated truth from this contract
///         instead of trusting any single data source.
contract TruthOracle {
    struct Ruling {
        bool exists;
        bool confirmed;
        bytes32 teamHash; // keccak256(team name)
        uint16 minuteOfMatch;
        uint8 tally; // jurors agreeing with the majority
        uint8 jurorCount;
        bytes32 testimonyRoot; // keccak256 of the concatenated testimony signatures
        uint64 finalizedAt;
    }

    address public immutable arbiter;
    mapping(bytes32 => Ruling) private _rulings;
    bytes32[] public reviewIds;

    event RulingRecorded(
        bytes32 indexed reviewId,
        bool confirmed,
        string team,
        uint16 minuteOfMatch,
        uint8 tally,
        uint8 jurorCount,
        bytes32 testimonyRoot
    );

    error NotArbiter();
    error AlreadyRecorded();

    constructor(address arbiter_) {
        arbiter = arbiter_;
    }

    function recordRuling(
        bytes32 reviewId,
        bool confirmed,
        string calldata team,
        uint16 minuteOfMatch,
        uint8 tally,
        uint8 jurorCount,
        bytes32 testimonyRoot
    ) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (_rulings[reviewId].exists) revert AlreadyRecorded();

        _rulings[reviewId] = Ruling({
            exists: true,
            confirmed: confirmed,
            teamHash: keccak256(bytes(team)),
            minuteOfMatch: minuteOfMatch,
            tally: tally,
            jurorCount: jurorCount,
            testimonyRoot: testimonyRoot,
            finalizedAt: uint64(block.timestamp)
        });
        reviewIds.push(reviewId);

        emit RulingRecorded(reviewId, confirmed, team, minuteOfMatch, tally, jurorCount, testimonyRoot);
    }

    function getRuling(bytes32 reviewId) external view returns (Ruling memory) {
        return _rulings[reviewId];
    }

    function rulingCount() external view returns (uint256) {
        return reviewIds.length;
    }
}
