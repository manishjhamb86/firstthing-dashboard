-- A society may exist before anyone has a trustworthy flat count.
ALTER TABLE "societies" ALTER COLUMN "flat_count" DROP NOT NULL;
