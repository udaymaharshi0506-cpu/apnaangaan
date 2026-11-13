import test from "node:test";
import assert from "node:assert/strict";

test("Admin Rental Dashboard KPIs structure & calculations", () => {
  const dummyProps = [
    { id: "1", rentalStatus: "rented", status: "live", price: 40000, verified: true },
    { id: "2", rentalStatus: "deal_in_progress", status: "live", price: 42000, verified: true },
    { id: "3", rentalStatus: "available_pending", status: "live", price: 35000, verified: true },
    { id: "4", rentalStatus: "available_pending", status: "pending_review", price: 30000, verified: false },
  ];

  const totalFlats = dummyProps.length;
  const rented = dummyProps.filter((p) => p.rentalStatus === "rented").length;
  const availablePending = dummyProps.filter(
    (p) => p.rentalStatus === "available_pending" || p.rentalStatus === "deal_in_progress"
  ).length;
  const underReview = dummyProps.filter((p) => p.status === "pending_review" || !p.verified).length;
  const occupancyRate = Math.round((rented / totalFlats) * 100);

  assert.equal(totalFlats, 4);
  assert.equal(rented, 1);
  assert.equal(occupancyRate, 25);
  assert.equal(availablePending, 3);
  assert.equal(underReview, 1);
});

test("Security deposit and brokerage remaining calculations", () => {
  const deal = {
    securityDepositTotal: 80000,
    securityDepositCollected: 50000,
    ownerFeeTotal: 15000,
    ownerFeeCollected: 15000,
    seekerFeeTotal: 15000,
    seekerFeeCollected: 7500,
  };

  const depositRemaining = deal.securityDepositTotal - deal.securityDepositCollected;
  const ownerFeeRemaining = deal.ownerFeeTotal - deal.ownerFeeCollected;
  const seekerFeeRemaining = deal.seekerFeeTotal - deal.seekerFeeCollected;

  assert.equal(depositRemaining, 30000);
  assert.equal(ownerFeeRemaining, 0);
  assert.equal(seekerFeeRemaining, 7500);

  const ownerFeeStatus = ownerFeeRemaining <= 0 ? "paid" : deal.ownerFeeCollected > 0 ? "partial" : "pending";
  const seekerFeeStatus = seekerFeeRemaining <= 0 ? "paid" : deal.seekerFeeCollected > 0 ? "partial" : "pending";
  const depositStatus = depositRemaining <= 0 ? "collected" : deal.securityDepositCollected > 0 ? "partial" : "pending";

  assert.equal(ownerFeeStatus, "paid");
  assert.equal(seekerFeeStatus, "partial");
  assert.equal(depositStatus, "partial");
});

test("Transaction ledger running balance calculation", () => {
  const txns = [
    { id: "1", amount: 80000, direction: "credit", status: "settled", createdAt: "2026-11-01" },
    { id: "2", amount: 15000, direction: "credit", status: "settled", createdAt: "2026-11-02" },
    { id: "3", amount: 5000, direction: "debit", status: "settled", createdAt: "2026-11-03" },
    { id: "4", amount: 10000, direction: "credit", status: "pending", createdAt: "2026-11-04" },
  ];

  let balance = 0;
  const computed = txns.map((t) => {
    if (t.status === "settled") {
      if (t.direction === "credit") balance += t.amount;
      else if (t.direction === "debit") balance -= t.amount;
    }
    return { ...t, runningBalance: balance };
  });

  assert.equal(computed[0].runningBalance, 80000);
  assert.equal(computed[1].runningBalance, 95000);
  assert.equal(computed[2].runningBalance, 90000);
  assert.equal(computed[3].runningBalance, 90000); // pending txn doesn't affect settled balance
  assert.equal(balance, 90000);
});
