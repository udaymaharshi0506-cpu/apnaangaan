-- ===================================================================
-- Apna Aangan (apnaangaan.in) — Managed Service & Owner Listing Migration
-- Target Engine: MySQL 8.0+ / MariaDB 10.5+
-- ===================================================================

-- 1. Create manager_requests table
CREATE TABLE IF NOT EXISTS `manager_requests` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `owner_id` VARCHAR(36) NOT NULL,
  `property_id` VARCHAR(36) NULL,
  `listing_mode` ENUM('self', 'managed') NOT NULL DEFAULT 'managed',
  `managed_tier` ENUM('none', 'standard', 'premium') NOT NULL DEFAULT 'standard',
  `fee_amount` DECIMAL(10, 2) NOT NULL DEFAULT 499.00,
  `payment_status` ENUM('not_required', 'pending', 'paid', 'failed') NOT NULL DEFAULT 'paid',
  `transaction_id` VARCHAR(100) NULL,
  `is_recommended` BOOLEAN NOT NULL DEFAULT FALSE,
  `request_status` ENUM('new', 'assigned', 'in_review', 'published', 'rejected') NOT NULL DEFAULT 'new',
  `assigned_manager_id` VARCHAR(36) NULL,
  `assigned_manager_name` VARCHAR(150) NULL,
  `property_title` VARCHAR(255) NULL,
  `locality` VARCHAR(120) NULL,
  `city` VARCHAR(100) NULL,
  `owner_contact_phone` VARCHAR(25) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_manager_requests_owner` (`owner_id`),
  INDEX `idx_manager_requests_status` (`request_status`),
  INDEX `idx_manager_requests_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Update listings / properties table with managed service and boost fields
ALTER TABLE `properties`
  ADD COLUMN IF NOT EXISTS `listing_mode` ENUM('self', 'managed') NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS `managed_tier` ENUM('none', 'standard', 'premium') NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS `fee_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS `payment_status` ENUM('not_required', 'pending', 'paid', 'failed') NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS `transaction_id` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `is_recommended` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS `request_status` ENUM('new', 'assigned', 'in_review', 'published', 'rejected') NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS `assigned_manager_id` VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS `assigned_manager_name` VARCHAR(150) NULL;

-- 3. Helpful query index for recommended search boost
CREATE INDEX IF NOT EXISTS `idx_properties_recommended` ON `properties` (`is_recommended`, `status`);

