-- ============================================================
-- Aangan Real Estate Marketplace — Supabase Database Setup
-- ============================================================
-- Run this SQL in your Supabase Dashboard → SQL Editor → New Query
-- This creates all tables, indexes, enums, and grants needed.
-- ============================================================

-- 1. Custom enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE property_category AS ENUM ('buy_home', 'rent_home', 'rent_pg', 'rent_commercial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE property_status AS ENUM ('pending_review', 'live', 'paused', 'sold', 'rented', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'meeting_scheduled', 'closed_won', 'closed_lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE meeting_mode AS ENUM ('call', 'site_visit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE meeting_status AS ENUM ('proposed', 'confirmed', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 2. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(150),
  password_hash TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'customer',
  roles JSONB NOT NULL DEFAULT '["customer"]'::jsonb,
  otp_verified_at TIMESTAMPTZ,
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category property_category NOT NULL,
  property_type VARCHAR(60) NOT NULL DEFAULT 'Apartment',
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price BIGINT NOT NULL,
  price_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  locality VARCHAR(120) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  bhk_or_room_type VARCHAR(50) NOT NULL,
  area_sqft INTEGER NOT NULL,
  bathrooms INTEGER NOT NULL DEFAULT 1,
  furnishing_status VARCHAR(40) NOT NULL DEFAULT 'Unfurnished',
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  availability_date TIMESTAMPTZ,
  rera_number VARCHAR(100),
  deposit BIGINT,
  status property_status NOT NULL DEFAULT 'pending_review',
  verified BOOLEAN NOT NULL DEFAULT false,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status lead_status NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  preferred_contact_time VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_by_admin_id UUID NOT NULL REFERENCES users(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  mode meeting_mode NOT NULL,
  status meeting_status NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS admin_call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES users(id),
  party VARCHAR(20) NOT NULL,
  outcome VARCHAR(100) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  query JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  phone VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS properties_category_idx ON properties(category);
CREATE INDEX IF NOT EXISTS properties_city_idx ON properties(city);
CREATE INDEX IF NOT EXISTS properties_status_idx ON properties(status);
CREATE INDEX IF NOT EXISTS properties_created_idx ON properties(created_at);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_customer_idx ON leads(customer_id);
CREATE INDEX IF NOT EXISTS leads_owner_idx ON leads(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS leads_customer_property_unique ON leads(customer_id, property_id);

CREATE INDEX IF NOT EXISTS meetings_lead_idx ON meetings(lead_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS call_logs_lead_idx ON admin_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);


-- 4. Row Level Security — disabled (app handles auth in its own API layer)
-- ============================================================

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE meetings DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_call_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches DISABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens DISABLE ROW LEVEL SECURITY;


-- 5. Done!
-- ============================================================
-- Your database is ready. Now set DATABASE_URL in .env and run the app.
