-- Rows left in `reading` by bulk drops made before intake stored first and
-- read on request (2026-09-16): each had its read started by the browser
-- and never finished (rate-limited, or the tab moved on). `reading` is a
-- transient state with no process behind it now, so they are unread.
UPDATE "invoice_intakes" SET "status" = 'uploaded', "extraction_error" = NULL WHERE "status" = 'reading';
