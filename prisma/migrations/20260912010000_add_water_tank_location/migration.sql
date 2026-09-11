-- A tank's tower/building was only readable from its free-text device name
-- ("RG Residency Tower D Tank"), which is not a grouping key — the portal
-- redesign (2026-09-11/12) needs a real one, per the same pattern already
-- used for setupType: a free label the back office types, null reading as
-- "not yet labelled" rather than guessed.
ALTER TABLE "water_tanks"
  ADD COLUMN "location" TEXT;
