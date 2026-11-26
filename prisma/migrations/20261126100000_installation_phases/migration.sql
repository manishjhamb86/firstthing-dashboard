-- CreateTable
CREATE TABLE "installation_phases" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "through_day" INTEGER NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "signatory_name" TEXT NOT NULL,
    "signatory_role" TEXT NOT NULL,
    "lights_override" INTEGER,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "billing_start_date" TIMESTAMP(3) NOT NULL,
    "prorated_days" INTEGER NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installation_phases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installation_phases_project_id_number_key" ON "installation_phases"("project_id", "number");

-- AddForeignKey
ALTER TABLE "installation_phases" ADD CONSTRAINT "installation_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "installation_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_phases" ADD CONSTRAINT "installation_phases_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Every existing completion certificate becomes phase 1 (2026-11-26). Nothing
-- billed moves: the certificate keeps its signature and billing start, and a
-- phase whose recorded count differs from its logged days keeps that count as
-- its override. Phase 1 holds the days logged on or before its signature; it
-- is the full installation unless the certificate was partial or work was
-- logged after it.
WITH logged AS (
  SELECT project_id, day, installed_count, submitted_at
  FROM installation_batches
  WHERE submitted_at IS NOT NULL AND state <> 'draft'
),
p1 AS (
  SELECT c.id AS cert_id, c.project_id, c.signed_at, c.signatory_name, c.signatory_role,
         c.total_installed_count, c.is_partial, c.billing_start_date, c.prorated_days, c.days_in_month,
         c.recorded_by_id, c.recorded_at,
         COALESCE(
           (SELECT max(l.day) FROM logged l WHERE l.project_id = c.project_id AND l.submitted_at::date <= c.signed_at::date),
           (SELECT max(l.day) FROM logged l WHERE l.project_id = c.project_id),
           0) AS through_day
  FROM completion_certificates c
)
INSERT INTO installation_phases (id, project_id, number, through_day, signed_at, signatory_name, signatory_role,
  lights_override, is_final, billing_start_date, prorated_days, days_in_month, recorded_by_id, recorded_at)
SELECT 'ph1-' || p1.cert_id, p1.project_id, 1, p1.through_day, p1.signed_at, p1.signatory_name, p1.signatory_role,
  CASE WHEN p1.total_installed_count <> COALESCE((SELECT sum(l.installed_count) FROM logged l WHERE l.project_id = p1.project_id AND l.day <= p1.through_day), 0)
       THEN p1.total_installed_count END,
  (NOT p1.is_partial) AND NOT EXISTS (SELECT 1 FROM logged l WHERE l.project_id = p1.project_id AND l.day > p1.through_day),
  p1.billing_start_date, p1.prorated_days, p1.days_in_month, p1.recorded_by_id, p1.recorded_at
FROM p1;

-- A partial certificate whose rest was already confirmed becomes a final phase 2.
INSERT INTO installation_phases (id, project_id, number, through_day, signed_at, signatory_name, signatory_role,
  lights_override, is_final, billing_start_date, prorated_days, days_in_month, recorded_by_id, recorded_at)
SELECT 'ph2-' || c.id, c.project_id, 2,
  (SELECT max(b.day) FROM installation_batches b WHERE b.project_id = c.project_id AND b.submitted_at IS NOT NULL AND b.state <> 'draft'),
  date_trunc('day', c.completed_at), c.signatory_name, c.signatory_role, NULL, true,
  date_trunc('day', c.completed_at) + interval '1 day',
  (date_part('day', date_trunc('month', c.completed_at) + interval '1 month' - interval '1 day') - date_part('day', c.completed_at))::int,
  date_part('day', date_trunc('month', c.completed_at) + interval '1 month' - interval '1 day')::int,
  COALESCE(c.completed_by_id, c.recorded_by_id), COALESCE(c.completed_at, c.recorded_at)
FROM completion_certificates c
JOIN installation_phases p ON p.id = 'ph1-' || c.id
WHERE c.is_partial AND c.completed_at IS NOT NULL
  AND (SELECT max(b.day) FROM installation_batches b WHERE b.project_id = c.project_id AND b.submitted_at IS NOT NULL AND b.state <> 'draft') > p.through_day;

-- A certificate whose phase 1 is not the full installation is a partial one:
-- the installation stays open until its final phase is signed off.
UPDATE completion_certificates c
SET is_partial = true, partial_reason = COALESCE(c.partial_reason, 'Installed in phases')
FROM installation_phases p
WHERE p.id = 'ph1-' || c.id AND NOT p.is_final AND NOT c.is_partial;
