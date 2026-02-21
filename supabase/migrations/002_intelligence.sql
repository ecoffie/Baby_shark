-- Baby Shark: Intelligence scoring + Micron Ventures profile seed
-- Adds scoring columns to low_competition_awards and seeds client_profile

-- Add scoring columns to low_competition_awards
ALTER TABLE low_competition_awards
  ADD COLUMN IF NOT EXISTS fit_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brief_category TEXT DEFAULT 'low';

CREATE INDEX IF NOT EXISTS idx_awards_fit_score ON low_competition_awards(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_awards_brief_category ON low_competition_awards(brief_category);

-- Seed Micron Ventures client profile
INSERT INTO client_profile (
  business_model,
  naics_codes,
  psc_codes,
  geographic_focus,
  preferred_agencies,
  prior_wins
) VALUES (
  'supplier',
  ARRAY['423510', '332310', '493', '484'],
  ARRAY['10', '56', '23', '19', '43'],
  ARRAY['GU', 'DG', 'EG', 'AE', 'LB', 'BR', 'AR', 'CL', 'CO', 'PE'],
  ARRAY['USACE', 'NAVFAC', 'STATE', 'Department of the Army', 'Department of the Navy', 'Department of State'],
  '{"examples": ["LOGCAP V", "WEXMAC", "Guam infrastructure"]}'::JSONB
)
ON CONFLICT DO NOTHING;
