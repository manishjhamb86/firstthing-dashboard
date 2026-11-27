-- RWA members are named on the public page by default (2026-11-27, the
-- user's call: "RWA Members name is missing"). A society can still be
-- switched off from its admin page.
ALTER TABLE "societies" ALTER COLUMN "public_show_leadership" SET DEFAULT true;
UPDATE "societies" SET public_show_leadership = true;
