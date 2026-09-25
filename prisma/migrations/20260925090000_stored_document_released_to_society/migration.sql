-- An invoice filed from intake reaches the society only once released (2026-09-25).
ALTER TABLE "stored_documents" ADD COLUMN "released_to_society_at" TIMESTAMP(3),
ADD COLUMN "released_to_society_by_id" TEXT;
