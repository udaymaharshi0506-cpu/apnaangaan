import test from "node:test";
import assert from "node:assert/strict";

test("Rule 1: Exclude Rejected Listings Everywhere - 8 live, 2 rejected yields strictly 8", () => {
  const dummyProps = [
    { id: "1", title: "Flat 1", status: "live", rentalStatus: "available_pending" },
    { id: "2", title: "Flat 2", status: "live", rentalStatus: "available_pending" },
    { id: "3", title: "Flat 3", status: "live", rentalStatus: "available_pending" },
    { id: "4", title: "Flat 4", status: "rented", rentalStatus: "rented" },
    { id: "5", title: "Flat 5", status: "rented", rentalStatus: "rented" },
    { id: "6", title: "Flat 6", status: "live", rentalStatus: "deal_in_progress" },
    { id: "7", title: "Flat 7", status: "live", rentalStatus: "available_pending" },
    { id: "8", title: "Flat 8", status: "live", rentalStatus: "available_pending" },
    { id: "9", title: "Rejected 1", status: "rejected", rentalStatus: "inactive" },
    { id: "10", title: "Rejected 2", status: "rejected", rentalStatus: "inactive" },
  ];

  // Rule: Complete exclusion of rejected listings
  const liveProps = dummyProps.filter((p) => p.status !== "rejected" && p.rentalStatus !== "inactive");
  assert.equal(liveProps.length, 8, "Expected exactly 8 live properties, excluding 2 rejected");

  const rentedFlats = liveProps.filter((p) => p.rentalStatus === "rented" || p.status === "rented").length;
  const pendingFlats = liveProps.filter(
    (p) =>
      (p.rentalStatus === "available_pending" || p.rentalStatus === "deal_in_progress" || p.status === "live") &&
      p.rentalStatus !== "rented" &&
      p.status !== "rented"
  ).length;

  const totalFlats = rentedFlats + pendingFlats;
  assert.equal(totalFlats, 8);
  assert.equal(rentedFlats, 2);
  assert.equal(pendingFlats, 6);
  assert.equal(totalFlats, rentedFlats + pendingFlats, "Assert total_live_flats === rented_flats + pending_flats");
});

test("Rule 2A: Listing properties generates zero revenue by itself", () => {
  const liveListedProps = Array.from({ length: 50 }, (_, i) => ({
    id: `prop-${i}`,
    title: `Listing ${i}`,
    status: "live",
    rentalStatus: "available_pending",
    price: 45000,
  }));

  const settledTxns: any[] = [];
  const closedDeals: any[] = [];

  const totalRevenue = settledTxns
    .filter((t) => ["owner_brokerage", "seeker_brokerage", "managed_listing_fee"].includes(t.category) && t.direction === "credit")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalExpectedDeposit = closedDeals.reduce((sum, d) => sum + Number(d.securityDepositTotal || 0), 0);

  assert.equal(totalRevenue, 0, "Revenue must be 0 when properties are only listed");
  assert.equal(totalExpectedDeposit, 0, "No deposit can be expected without closed deals");
});

test("Rule 2B: Rental deals count in payment mode ONLY after deal closure", () => {
  const props = [
    { id: "p1", status: "rented", rentalStatus: "rented" },
    { id: "p2", status: "live", rentalStatus: "available_pending" },
    { id: "p3", status: "rejected", rentalStatus: "inactive" },
  ];
  const propMap = new Map(props.map((p) => [p.id, p]));

  const deals = [
    // Closed deal on a rented property -> VALID
    {
      id: "d1",
      propertyId: "p1",
      dealStatus: "closed",
      securityDepositTotal: 80000,
      securityDepositCollected: 80000,
      ownerFeeTotal: 20000,
      ownerFeeCollected: 15000,
      seekerFeeTotal: 20000,
      seekerFeeCollected: 20000,
    },
    // In-progress deal on a live property -> NOT CLOSED, MUST BE EXCLUDED
    {
      id: "d2",
      propertyId: "p2",
      dealStatus: "in_progress",
      securityDepositTotal: 90000,
      securityDepositCollected: 0,
      ownerFeeTotal: 22500,
      ownerFeeCollected: 0,
      seekerFeeTotal: 22500,
      seekerFeeCollected: 0,
    },
    // Deal on a rejected property -> MUST BE EXCLUDED
    {
      id: "d3",
      propertyId: "p3",
      dealStatus: "closed",
      securityDepositTotal: 100000,
      securityDepositCollected: 100000,
      ownerFeeTotal: 25000,
      ownerFeeCollected: 25000,
      seekerFeeTotal: 25000,
      seekerFeeCollected: 25000,
    },
  ];

  const closedDeals = deals.filter((d) => {
    const p = propMap.get(d.propertyId);
    if (!p || p.status === "rejected" || p.rentalStatus === "inactive") return false;
    const isClosed = d.dealStatus === "closed" || d.dealStatus === "active_rented";
    const isRented = p.rentalStatus === "rented" || p.status === "rented";
    return isClosed && isRented;
  });

  assert.equal(closedDeals.length, 1, "Only d1 is valid closed deal");

  const depositExpected = closedDeals.reduce((sum, d) => sum + d.securityDepositTotal, 0);
  const depositCollected = closedDeals.reduce((sum, d) => sum + d.securityDepositCollected, 0);
  const depositRemaining = Math.max(0, depositExpected - depositCollected);

  assert.equal(depositExpected, 80000);
  assert.equal(depositCollected, 80000);
  assert.equal(depositRemaining, 0);

  const ownerExpected = closedDeals.reduce((sum, d) => sum + d.ownerFeeTotal, 0);
  const ownerCollected = closedDeals.reduce((sum, d) => sum + d.ownerFeeCollected, 0);
  const ownerRemaining = Math.max(0, ownerExpected - ownerCollected);

  assert.equal(ownerExpected, 20000);
  assert.equal(ownerCollected, 15000);
  assert.equal(ownerRemaining, 5000);
});

test("Rule 2C & Rule 3: Managed listing fees & deposit separation in revenue vs account balance", () => {
  const txns = [
    // Settled owner fee -> Revenue & Account Balance
    { id: "t1", status: "settled", category: "owner_brokerage", amount: 15000, direction: "credit" },
    // Settled seeker fee -> Revenue & Account Balance
    { id: "t2", status: "settled", category: "seeker_brokerage", amount: 20000, direction: "credit" },
    // Settled managed listing fee (verified payment) -> Revenue & Account Balance
    { id: "t3", status: "settled", category: "managed_listing_fee", amount: 999, direction: "credit" },
    // Pending managed listing fee (not settled yet) -> MUST BE EXCLUDED
    { id: "t4", status: "pending", category: "managed_listing_fee", amount: 499, direction: "credit" },
    // Settled security deposit -> Account Balance ONLY, NEVER Revenue!
    { id: "t5", status: "settled", category: "security_deposit", amount: 80000, direction: "credit" },
    // Settled refund/payout -> Account Balance DEBIT
    { id: "t6", status: "settled", category: "refund_or_payout", amount: 5000, direction: "debit" },
  ];

  const validSettled = txns.filter((t) => t.status === "settled");

  // Revenue: ONLY brokerage + managed listing fee (NEVER security deposit)
  const totalRevenue = validSettled
    .filter((t) => ["owner_brokerage", "seeker_brokerage", "managed_listing_fee"].includes(t.category) && t.direction === "credit")
    .reduce((sum, t) => sum + t.amount, 0);

  assert.equal(totalRevenue, 15000 + 20000 + 999, "Total revenue must be exactly 35999 (excluding deposit and pending fees)");

  // Money in Our Account: All settled credits minus debits (including security deposit escrow)
  const totalCredits = validSettled
    .filter((t) => t.direction === "credit")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = validSettled
    .filter((t) => t.direction === "debit")
    .reduce((sum, t) => sum + t.amount, 0);

  const netAccountBalance = totalCredits - totalDebits;

  assert.equal(totalCredits, 15000 + 20000 + 999 + 80000);
  assert.equal(totalDebits, 5000);
  assert.equal(netAccountBalance, 115999 - 5000, "Money in account must be 110999");
});

