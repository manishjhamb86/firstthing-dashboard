-- What the document covers, as distinct from the month it is filed under.
ALTER TABLE "stored_documents" ADD COLUMN "covers_from" TIMESTAMP(3);
ALTER TABLE "stored_documents" ADD COLUMN "covers_to" TIMESTAMP(3);
