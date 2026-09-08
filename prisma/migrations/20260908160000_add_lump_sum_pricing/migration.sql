-- CON-01 amendment (2026-09-08, the user's call): FirsThing's monthly fee can
-- be a flat negotiated amount instead of a share of the savings — asked for on
-- a counter-offer, where a society wants a fixed figure.
--
-- Additive: every existing row is a revenue-share deal, which is the default,
-- so nothing already agreed changes meaning. `revenue_share_pct` becomes
-- nullable because a lump-sum deal genuinely has no share, and storing a
-- sentinel there would be a percentage somebody could read as agreed.
CREATE TYPE "pricing_model" AS ENUM ('revenue_share', 'lump_sum');

ALTER TABLE "offers"
  ADD COLUMN "pricing_model" "pricing_model" NOT NULL DEFAULT 'revenue_share',
  ADD COLUMN "lump_sum_monthly_fee" DOUBLE PRECISION,
  ALTER COLUMN "revenue_share_pct" DROP NOT NULL;

ALTER TABLE "contract_term_versions"
  ADD COLUMN "pricing_model" "pricing_model" NOT NULL DEFAULT 'revenue_share',
  ADD COLUMN "lump_sum_monthly_fee" DOUBLE PRECISION,
  ALTER COLUMN "revenue_share_pct" DROP NOT NULL;
