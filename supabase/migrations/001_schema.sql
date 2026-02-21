-- Baby Shark: Low-Competition Federal Contract Intelligence
-- Schema for awards, IDIQ vehicles, expiring IDIQs, client profile, ingestion log

-- Low-competition awards (from USA Spending + Tango)
CREATE TABLE IF NOT EXISTS low_competition_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id TEXT UNIQUE NOT NULL,
  title TEXT,
  agency TEXT,
  amount DECIMAL(18, 2),
  number_of_offers INTEGER,
  extent_competed TEXT,
  psc_code TEXT,
  naics TEXT,
  award_date DATE,
  usa_spending_url TEXT,
  recipient_name TEXT,
  place_of_performance_country TEXT,
  parent_idv TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_awards_amount ON low_competition_awards(amount);
CREATE INDEX idx_awards_award_date ON low_competition_awards(award_date);
CREATE INDEX idx_awards_place ON low_competition_awards(place_of_performance_country);
CREATE INDEX idx_awards_parent_idv ON low_competition_awards(parent_idv);

-- IDIQ vehicles (LOGCAP, WEXMAC, Guam, Diego Garcia, etc.)
CREATE TABLE IF NOT EXISTS idiq_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_uuid TEXT,
  solicitation_identifier TEXT NOT NULL,
  awardee_count INTEGER,
  order_count INTEGER,
  vehicle_obligations DECIMAL(18, 2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vehicles_solicitation ON idiq_vehicles(solicitation_identifier);

-- Expiring IDIQs (from Tango IDVs period_of_performance.last_date_to_order)
CREATE TABLE IF NOT EXISTS expiring_idiqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idv_key TEXT UNIQUE NOT NULL,
  piid TEXT,
  solicitation_identifier TEXT,
  last_date_to_order DATE NOT NULL,
  agency TEXT,
  vehicle_obligations DECIMAL(18, 2),
  order_count INTEGER,
  place_of_performance TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expiring_last_date ON expiring_idiqs(last_date_to_order);

-- Client profile (Micron Ventures)
CREATE TABLE IF NOT EXISTS client_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_model TEXT DEFAULT 'supplier',
  naics_codes TEXT[],
  psc_codes TEXT[],
  geographic_focus TEXT[],
  preferred_agencies TEXT[],
  prior_wins JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ingestion log (track syncs, errors)
CREATE TABLE IF NOT EXISTS ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  page_count INTEGER,
  record_count INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ingestion_source ON ingestion_log(source);
CREATE INDEX idx_ingestion_started ON ingestion_log(started_at);
