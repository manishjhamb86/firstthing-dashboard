
-- AlterTable
ALTER TABLE "societies" ADD COLUMN     "public_intro" TEXT,
ADD COLUMN     "public_page_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "public_page_published_at" TIMESTAMP(3),
ADD COLUMN     "public_show_leadership" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_slug" TEXT,
ADD COLUMN     "public_slug_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "societies_public_slug_key" ON "societies"("public_slug");

-- CreateIndex
CREATE UNIQUE INDEX "societies_public_slug_key_key" ON "societies"("public_slug_key");

-- Backfill (2026-11-27): every society gets an address from its name, the
-- same rule as src/lib/society-slug.ts — a leading "The" dropped, everything
-- else lower case, runs of other characters one hyphen. A second society with
-- the same address gets "-2", "-3"…; an address that is one of the app's own
-- top-level paths gets "-society". The page goes live with today's date on
-- its certificate; the back office can switch any page off.
WITH base AS (
  SELECT id,
         trim(both '-' from regexp_replace(lower(regexp_replace(trim(name), '^the\s+', '', 'i')), '[^a-z0-9]+', '-', 'g')) AS slug,
         created_at
  FROM "societies"
), safe AS (
  SELECT id, created_at,
         CASE WHEN slug = '' THEN 'society'
              WHEN replace(slug, '-', '') IN ('admin','portal','field','fieldicon','login','api','marketing','i','icon','next','favicon','robots','sitemap','manifest','logout','signup','static','public','brand','s')
                THEN slug || '-society'
              ELSE slug END AS slug
  FROM base
), numbered AS (
  SELECT id, slug,
         row_number() OVER (PARTITION BY replace(slug, '-', '') ORDER BY created_at, id) AS n
  FROM safe
)
UPDATE "societies" s
SET public_slug = CASE WHEN n.n = 1 THEN n.slug ELSE n.slug || '-' || n.n END,
    public_slug_key = CASE WHEN n.n = 1 THEN replace(n.slug, '-', '') ELSE replace(n.slug, '-', '') || n.n END,
    public_page_published_at = now()
FROM numbered n
WHERE s.id = n.id;
