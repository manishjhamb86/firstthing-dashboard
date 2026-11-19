-- Days the room's other, electricity-only meter reported (2026-11-19).
ALTER TYPE "ems_pump_reading_origin" ADD VALUE IF NOT EXISTS 'other_meter';
