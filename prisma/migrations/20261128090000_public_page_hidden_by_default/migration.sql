-- Public society pages stay hidden until the back office makes each one
-- visible (2026-11-28, the user's call).
ALTER TABLE "societies" ALTER COLUMN "public_page_enabled" SET DEFAULT false;
UPDATE "societies" SET "public_page_enabled" = false;
