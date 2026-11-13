import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { properties, users, rentalDeals, transactionsLedger } from "../src/db/schema";

async function migrate() {
  console.log("Starting Rental Tracking & Ledger migration...");

  // 1. Alter properties table
  await db.execute(sql`
    ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS rental_status VARCHAR(30) DEFAULT 'available_pending',
      ADD COLUMN IF NOT EXISTS monthly_rent BIGINT;
  `);
  console.log("✓ properties columns verified");

  // 2. Create rental_deals table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rental_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_code VARCHAR(50) UNIQUE,
      property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seeker_id UUID REFERENCES users(id) ON DELETE SET NULL,
      seeker_name VARCHAR(150),
      seeker_phone VARCHAR(25),
      seeker_email VARCHAR(255),
      lease_start_date TIMESTAMPTZ,
      lease_end_date TIMESTAMPTZ,
      monthly_rent BIGINT NOT NULL DEFAULT 0,
      stay_duration_months INTEGER DEFAULT 11,
      security_deposit_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      security_deposit_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      owner_fee_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      owner_fee_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      seeker_fee_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      seeker_fee_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      deal_status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rental_deals_property_idx ON rental_deals(property_id);
    CREATE INDEX IF NOT EXISTS rental_deals_owner_idx ON rental_deals(owner_id);
    CREATE INDEX IF NOT EXISTS rental_deals_status_idx ON rental_deals(deal_status);
    CREATE INDEX IF NOT EXISTS rental_deals_created_idx ON rental_deals(created_at);
  `);
  console.log("✓ rental_deals table verified");

  // 3. Create transactions_ledger table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      txn_code VARCHAR(50) UNIQUE,
      deal_id UUID REFERENCES rental_deals(id) ON DELETE SET NULL,
      property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
      payer_type VARCHAR(20) NOT NULL DEFAULT 'seeker',
      payer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      payer_name VARCHAR(150),
      category VARCHAR(40) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      direction VARCHAR(10) NOT NULL DEFAULT 'credit',
      payment_mode VARCHAR(30) NOT NULL DEFAULT 'upi',
      reference_id VARCHAR(120),
      status VARCHAR(20) NOT NULL DEFAULT 'settled',
      reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'reconciled',
      notes TEXT,
      recorded_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
      recorded_by_admin_name VARCHAR(150),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS transactions_ledger_deal_idx ON transactions_ledger(deal_id);
    CREATE INDEX IF NOT EXISTS transactions_ledger_property_idx ON transactions_ledger(property_id);
    CREATE INDEX IF NOT EXISTS transactions_ledger_category_idx ON transactions_ledger(category);
    CREATE INDEX IF NOT EXISTS transactions_ledger_status_idx ON transactions_ledger(status);
    CREATE INDEX IF NOT EXISTS transactions_ledger_created_idx ON transactions_ledger(created_at);
  `);
  console.log("✓ transactions_ledger table verified");

  // 4. Update existing properties rental_status based on their current status
  await db.execute(sql`
    UPDATE properties 
    SET rental_status = CASE 
      WHEN status = 'live' THEN 'available_pending'
      WHEN status = 'rented' THEN 'rented'
      ELSE 'available_pending'
    END,
    monthly_rent = COALESCE(monthly_rent, price)
    WHERE rental_status IS NULL OR monthly_rent IS NULL;
  `);

  // 5. Seed initial realistic deals if table is empty
  const [existingDeals] = await db.select({ count: sql<number>`count(*)` }).from(rentalDeals);
  if (Number(existingDeals?.count || 0) === 0) {
    console.log("Seeding initial deals & ledger entries...");
    const allProps = await db.select().from(properties).limit(3);
    const [adminUser] = await db.select().from(users).where(sql`roles::jsonb ? 'admin' OR role = 'admin'`).limit(1);

    if (allProps.length > 0) {
      const p1 = allProps[0];
      // Mark p1 as rented
      await db.update(properties).set({ rentalStatus: "rented" }).where(sql`id = ${p1.id}`);

      const [deal1] = await db.insert(rentalDeals).values({
        dealCode: "DEAL-AA-1001",
        propertyId: p1.id,
        ownerId: p1.ownerId,
        seekerName: "Rohan Verma",
        seekerPhone: "9876543210",
        seekerEmail: "rohan.verma@example.com",
        leaseStartDate: new Date("2026-11-01T00:00:00Z"),
        leaseEndDate: new Date("2027-10-31T00:00:00Z"),
        monthlyRent: Number(p1.price || 40000),
        stayDurationMonths: 11,
        securityDepositTotal: "80000.00",
        securityDepositCollected: "80000.00",
        ownerFeeTotal: "15000.00",
        ownerFeeCollected: "15000.00",
        seekerFeeTotal: "15000.00",
        seekerFeeCollected: "10000.00",
        dealStatus: "active_rented",
        notes: "Agreement signed, keys handed over. Balance ₹5,000 pending from tenant on Nov 20.",
      }).returning();

      // Transactions for deal 1
      await db.insert(transactionsLedger).values([
        {
          txnCode: "TXN-SEC-1001",
          dealId: deal1.id,
          propertyId: p1.id,
          payerType: "seeker",
          payerName: "Rohan Verma",
          category: "security_deposit",
          amount: "80000.00",
          direction: "credit",
          paymentMode: "bank_transfer",
          referenceId: "HDFC-NEFT-9281741",
          status: "settled",
          reconciliationStatus: "reconciled",
          notes: "Security deposit 2 months advance settled to escrow",
          recordedByAdminId: adminUser?.id,
          recordedByAdminName: adminUser?.name || "Aangan Admin",
        },
        {
          txnCode: "TXN-FEE-1002",
          dealId: deal1.id,
          propertyId: p1.id,
          payerType: "owner",
          payerName: p1.ownerName || "Owner",
          category: "owner_brokerage",
          amount: "15000.00",
          direction: "credit",
          paymentMode: "upi",
          referenceId: "UPI/339182910/SBI",
          status: "settled",
          reconciliationStatus: "reconciled",
          notes: "Owner brokerage fee full settlement",
          recordedByAdminId: adminUser?.id,
          recordedByAdminName: adminUser?.name || "Aangan Admin",
        },
        {
          txnCode: "TXN-FEE-1003",
          dealId: deal1.id,
          propertyId: p1.id,
          payerType: "seeker",
          payerName: "Rohan Verma",
          category: "seeker_brokerage",
          amount: "10000.00",
          direction: "credit",
          paymentMode: "upi",
          referenceId: "UPI/819283719/ICICI",
          status: "settled",
          reconciliationStatus: "reconciled",
          notes: "Seeker brokerage partial payment (₹5,000 remaining)",
          recordedByAdminId: adminUser?.id,
          recordedByAdminName: adminUser?.name || "Aangan Admin",
        },
      ]);

      if (allProps.length > 1) {
        const p2 = allProps[1];
        await db.update(properties).set({ rentalStatus: "deal_in_progress" }).where(sql`id = ${p2.id}`);

        const [deal2] = await db.insert(rentalDeals).values({
          dealCode: "DEAL-AA-1002",
          propertyId: p2.id,
          ownerId: p2.ownerId,
          seekerName: "Ananya Sharma",
          seekerPhone: "9811223344",
          seekerEmail: "ananya.sharma@example.com",
          leaseStartDate: new Date("2026-11-20T00:00:00Z"),
          monthlyRent: Number(p2.price || 42000),
          stayDurationMonths: 11,
          securityDepositTotal: "84000.00",
          securityDepositCollected: "42000.00",
          ownerFeeTotal: "15000.00",
          ownerFeeCollected: "0.00",
          seekerFeeTotal: "15000.00",
          seekerFeeCollected: "7500.00",
          dealStatus: "in_progress",
          notes: "Token received. Lease agreement drafting in progress.",
        }).returning();

        await db.insert(transactionsLedger).values([
          {
            txnCode: "TXN-SEC-1004",
            dealId: deal2.id,
            propertyId: p2.id,
            payerType: "seeker",
            payerName: "Ananya Sharma",
            category: "security_deposit",
            amount: "42000.00",
            direction: "credit",
            paymentMode: "upi",
            referenceId: "UPI/991827361/GPAY",
            status: "settled",
            reconciliationStatus: "reconciled",
            notes: "Token deposit (1 month advance, 1 month pending)",
            recordedByAdminId: adminUser?.id,
            recordedByAdminName: adminUser?.name || "Aangan Admin",
          },
          {
            txnCode: "TXN-FEE-1005",
            dealId: deal2.id,
            propertyId: p2.id,
            payerType: "seeker",
            payerName: "Ananya Sharma",
            category: "seeker_brokerage",
            amount: "7500.00",
            direction: "credit",
            paymentMode: "upi",
            referenceId: "UPI/551234910/PHONEPE",
            status: "settled",
            reconciliationStatus: "reconciled",
            notes: "Advance booking fee (50% remaining)",
            recordedByAdminId: adminUser?.id,
            recordedByAdminName: adminUser?.name || "Aangan Admin",
          },
        ]);
      }
    }
  }

  console.log("Migration completed successfully!");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });
