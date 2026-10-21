-- Mark a society a defaulter (2026-10-21, user-asked): a stated, reversible
-- flag, separate from CON-13's own automatic arrears clock. Purely additive.
ALTER TABLE "societies"
  ADD COLUMN "marked_defaulter_at" TIMESTAMP(3),
  ADD COLUMN "marked_defaulter_by_id" TEXT,
  ADD COLUMN "marked_defaulter_reason" TEXT;
