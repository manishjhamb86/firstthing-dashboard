-- A due date and a payment status read as an action item, not a filed
-- document — its own grant rather than folded into `documents` (2026-09-12).
ALTER TYPE "portal_grant" ADD VALUE 'billing';
