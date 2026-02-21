-- Baby Shark: SAM.gov opportunities + expiring IDIQ enhancements

-- Active solicitations from SAM.gov (RFP, RFQ, Combined Synopsis)
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id TEXT UNIQUE NOT NULL,
  title TEXT,
  solicitation_number TEXT,
  agency TEXT,
  posted_date DATE,
  response_deadline DATE,
  type TEXT,                          -- Solicitation, Combined Synopsis, etc.
  naics_code TEXT,
  classification_code TEXT,           -- PSC code
  set_aside TEXT,
  set_aside_description TEXT,
  place_of_performance_country TEXT,
  place_of_performance_state TEXT,
  place_of_performance_city TEXT,
  sam_url TEXT,
  source TEXT DEFAULT 'sam.gov',      -- sam.gov or dla
  active TEXT DEFAULT 'Yes',
  -- Scoring
  fit_score INTEGER DEFAULT 0,
  fit_details JSONB DEFAULT '{}',
  brief_category TEXT DEFAULT 'low',
  -- Contact info
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  -- Award info (if awarded)
  award_date DATE,
  award_amount DECIMAL(18, 2),
  awardee_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opps_notice_id ON opportunities(notice_id);
CREATE INDEX IF NOT EXISTS idx_opps_response_deadline ON opportunities(response_deadline);
CREATE INDEX IF NOT EXISTS idx_opps_fit_score ON opportunities(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_opps_brief_category ON opportunities(brief_category);
CREATE INDEX IF NOT EXISTS idx_opps_source ON opportunities(source);
CREATE INDEX IF NOT EXISTS idx_opps_naics ON opportunities(naics_code);
CREATE INDEX IF NOT EXISTS idx_opps_posted ON opportunities(posted_date);

-- Add urgency/expiration fields to expiring_idiqs for better timeline display
ALTER TABLE expiring_idiqs
  ADD COLUMN IF NOT EXISTS fit_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brief_category TEXT DEFAULT 'low';

CREATE INDEX IF NOT EXISTS idx_expiring_fit_score ON expiring_idiqs(fit_score DESC);
