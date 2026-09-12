-- A photo of the signed, stamped paper checklist (2026-09-12, user-asked) —
-- one image covering both signature blocks and the stamp at once, since
-- that is what the paper form physically is. Purely additive.

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN "evidence_photo_key" TEXT;
