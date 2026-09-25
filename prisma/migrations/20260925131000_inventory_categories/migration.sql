-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_name_key" ON "inventory_categories"("name");


-- Seed from the categories in use, plus the common ones.
INSERT INTO "inventory_categories" ("id", "name")
SELECT 'inv-cat-' || md5(c), c FROM (
  SELECT DISTINCT category AS c FROM "inventory_item_types"
  UNION SELECT unnest(ARRAY['light', 'meter', 'network', 'water', 'cable', 'consumable', 'tool'])
) x
ON CONFLICT DO NOTHING;
