// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ITruthOracle {
    struct Ruling {
        bool exists;
        bool confirmed;
        bytes32 teamHash;
        uint16 minuteOfMatch;
        uint8 tally;
        uint8 jurorCount;
        bytes32 testimonyRoot;
        uint64 finalizedAt;
    }

    function getRuling(bytes32 reviewId) external view returns (Ruling memory);
}

/// @title ParametricPool — self-settling insurance term for a match event
/// @notice Holds USDC against one hard-coded parametric term. Anyone may call
///         `claim` with a reviewId; the pool verifies the ruling directly
///         against the TruthOracle (which is fed by the AI jury) and pays out
///         once. No claims process, no disputes, no humans — and no trust in
///         the treasurer either: the payout condition is enforced on-chain.
contract ParametricPool {
    IERC20 public immutable usdc;
    ITruthOracle public immutable oracle;

    bytes32 public immutable teamHash;
    uint16 public immutable afterMinute;
    uint16 public immutable beforeMinute;
    uint256 public immutable payoutAmount;
    address public immutable beneficiary;
    string public termDescription;
    bool public paid;

    event Payout(bytes32 indexed reviewId, address indexed beneficiary, uint256 amount);

    error AlreadyPaid();
    error TermNotMet();

    constructor(
        address usdc_,
        address oracle_,
        string memory team,
        uint16 afterMinute_,
        uint16 beforeMinute_,
        uint256 payoutAmount_,
        address beneficiary_,
        string memory termDescription_
    ) {
        usdc = IERC20(usdc_);
        oracle = ITruthOracle(oracle_);
        teamHash = keccak256(bytes(team));
        afterMinute = afterMinute_;
        beforeMinute = beforeMinute_;
        payoutAmount = payoutAmount_;
        beneficiary = beneficiary_;
        termDescription = termDescription_;
    }

    function claim(bytes32 reviewId) external {
        if (paid) revert AlreadyPaid();

        ITruthOracle.Ruling memory r = oracle.getRuling(reviewId);
        bool met = r.exists &&
            r.confirmed &&
            r.teamHash == teamHash &&
            r.minuteOfMatch > afterMinute &&
            r.minuteOfMatch < beforeMinute;
        if (!met) revert TermNotMet();

        paid = true;
        require(usdc.transfer(beneficiary, payoutAmount), "USDC transfer failed");
        emit Payout(reviewId, beneficiary, payoutAmount);
    }
}
