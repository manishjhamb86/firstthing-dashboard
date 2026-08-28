-- ATS Greens Paradiso's flat count was its light count too.
--
-- Seven for seven now: 951 is exactly the number of lights installed, which
-- its June 2026 invoice bills for. Same import error as the other six,
-- cleared the same way and guarded on the same wrong value.
UPDATE societies SET flat_count = NULL WHERE name = 'ATS Greens Paradiso' AND flat_count = 951;
