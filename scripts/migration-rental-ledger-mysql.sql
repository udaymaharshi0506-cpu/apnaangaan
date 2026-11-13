-- ========================================================
-- Apna Aangan (apnaangaan.in)
-- Rental Tracking, Brokerage & Account Ledger Migration (MySQL)
-- ========================================================

ALTER TABLE `properties` 
  ADD COLUMN IF NOT EXISTS `rental_status` ENUM('available_pending', 'deal_in_progress', 'rented', 'inactive') NOT NULL DEFAULT 'available_pending',
  ADD COLUMN IF NOT EXISTS `monthly_rent` BIGINT NULL;

-- 1. Rental Deals Table (Tracking property, owner, seeker, monthly rent, deposits & brokerage)
CREATE TABLE IF NOT EXISTS `rental_deals` (
  `id` VARCHAR(36) PRIMARY KEY,
  `deal_code` VARCHAR(50) UNIQUE,
  `property_id` VARCHAR(36) NOT NULL,
  `owner_id` VARCHAR(36) NOT NULL,
  `seeker_id` VARCHAR(36) NULL,
  `seeker_name` VARCHAR(150) NULL,
  `seeker_phone` VARCHAR(25) NULL,
  `seeker_email` VARCHAR(255) NULL,
  `lease_start_date` DATETIME NULL,
  `lease_end_date` DATETIME NULL,
  `monthly_rent` BIGINT NOT NULL DEFAULT 0,
  `stay_duration_months` INT DEFAULT 11,
  `security_deposit_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `security_deposit_collected` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `owner_fee_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `owner_fee_collected` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `seeker_fee_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `seeker_fee_collected` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `deal_status` ENUM('in_progress', 'active_rented', 'completed', 'terminated') NOT NULL DEFAULT 'in_progress',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_rental_deals_property` (`property_id`),
  INDEX `idx_rental_deals_owner` (`owner_id`),
  INDEX `idx_rental_deals_status` (`deal_status`),
  INDEX `idx_rental_deals_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Transactions & Account Ledger Table (Chronological double-entry cash flow)
CREATE TABLE IF NOT EXISTS `transactions_ledger` (
  `id` VARCHAR(36) PRIMARY KEY,
  `txn_code` VARCHAR(50) UNIQUE,
  `deal_id` VARCHAR(36) NULL,
  `property_id` VARCHAR(36) NULL,
  `payer_type` ENUM('owner', 'seeker', 'other') NOT NULL DEFAULT 'seeker',
  `payer_id` VARCHAR(36) NULL,
  `payer_name` VARCHAR(150) NULL,
  `category` ENUM('owner_brokerage', 'seeker_brokerage', 'security_deposit', 'managed_listing_fee', 'refund_or_payout') NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `direction` ENUM('credit', 'debit') NOT NULL DEFAULT 'credit',
  `payment_mode` VARCHAR(30) NOT NULL DEFAULT 'upi',
  `reference_id` VARCHAR(120) NULL,
  `status` ENUM('settled', 'pending', 'failed') NOT NULL DEFAULT 'settled',
  `reconciliation_status` VARCHAR(20) NOT NULL DEFAULT 'reconciled',
  `notes` TEXT NULL,
  `recorded_by_admin_id` VARCHAR(36) NULL,
  `recorded_by_admin_name` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_txn_deal` (`deal_id`),
  INDEX `idx_txn_property` (`property_id`),
  INDEX `idx_txn_category` (`category`),
  INDEX `idx_txn_status` (`status`),
  INDEX `idx_txn_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
