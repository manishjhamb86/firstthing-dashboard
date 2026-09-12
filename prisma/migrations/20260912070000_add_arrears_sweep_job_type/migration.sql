-- CON-13's suspension progression, wired to a recurring job for the first
-- time (2026-09-12) — a new JobType value for the ADR-003 queue, alongside
-- gatepass_sweep/tank_level_sample/meter_poll.
ALTER TYPE "job_type" ADD VALUE 'arrears_sweep';
