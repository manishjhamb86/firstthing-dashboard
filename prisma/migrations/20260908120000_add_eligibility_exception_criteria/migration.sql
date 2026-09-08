-- CON-16 amendment (2026-09-08, the user's call): a hard criterion can be
-- waived by operations, not only the light-count minimum. Which criteria an
-- approval waived is recorded, because they are not interchangeable — a
-- waived WiFi criterion means the meter may never report.
ALTER TABLE "circuits"
  ADD COLUMN "eligibility_exception_criteria" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Every exception recorded before today was a light-count one: the action
-- refused a hard-criterion failure outright, so nothing else could exist.
UPDATE "circuits"
   SET "eligibility_exception_criteria" = ARRAY['lightCount']
 WHERE "light_count_exception_approved_by" IS NOT NULL;
