# Inspection Role - Database Setup Guide

This document provides the SQL commands needed to set up the inspection role feature in Supabase.

## Prerequisites
- Access to Supabase dashboard
- Admin privileges to run SQL migrations

## Step 1: Create inspection_forms Table

Run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE inspection_forms (
  id BIGSERIAL PRIMARY KEY,
  society_id INTEGER NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  area VARCHAR(255) NOT NULL,
  inspection_date DATE NOT NULL,
  inspector_name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  total_lights_checked INTEGER NOT NULL,
  faulty_lights INTEGER NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  society_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_inspection_forms_society_id ON inspection_forms(society_id);
CREATE INDEX idx_inspection_forms_created_by ON inspection_forms(created_by);
CREATE INDEX idx_inspection_forms_inspection_date ON inspection_forms(inspection_date);
CREATE INDEX idx_inspection_forms_created_at ON inspection_forms(created_at);
```

## Step 2: Create inspection_form_items Table

```sql
CREATE TABLE inspection_form_items (
  id BIGSERIAL PRIMARY KEY,
  inspection_form_id BIGINT NOT NULL REFERENCES inspection_forms(id) ON DELETE CASCADE,
  location VARCHAR(255) NOT NULL,
  issue_type VARCHAR(100) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index
CREATE INDEX idx_inspection_form_items_inspection_id ON inspection_form_items(inspection_form_id);
```

## Step 3: Update profiles Table (Add inspection role)

The profiles table should already exist. Verify it has the `role` column with the correct constraint:

```sql
-- Check if role constraint allows 'inspection'
-- If not, you may need to update the constraint (BE CAREFUL WITH THIS)

-- View current profiles table structure
SELECT * FROM information_schema.columns WHERE table_name = 'profiles';

-- If role is an enum, you may need to add 'inspection' value:
-- ALTER TYPE user_role ADD VALUE 'inspection';
-- (Note: This depends on how your role column was defined)
```

## Step 4: Enable Row Level Security (RLS)

Add security policies:

```sql
-- RLS for inspection_forms
ALTER TABLE inspection_forms ENABLE ROW LEVEL SECURITY;

-- Inspection users can create and view their own
CREATE POLICY "Inspectors can create forms" ON inspection_forms
FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Inspectors can view own forms" ON inspection_forms
FOR SELECT USING (auth.uid() = created_by);

-- Customers can view forms from their society
CREATE POLICY "Customers can view society forms" ON inspection_forms
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'customer'
    AND profiles.society_id = inspection_forms.society_id
  )
);

-- Admins can view all forms
CREATE POLICY "Admins can view all forms" ON inspection_forms
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- RLS for inspection_form_items
ALTER TABLE inspection_form_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View checklist items" ON inspection_form_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM inspection_forms 
    WHERE inspection_forms.id = inspection_form_items.inspection_form_id
    AND (
      inspection_forms.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid()
        AND (profiles.role = 'admin' OR profiles.role = 'customer')
        AND profiles.society_id = inspection_forms.society_id
      )
    )
  )
);
```

## Step 5: Create Test User (Optional)

Create an inspection user for testing:

```sql
-- Use Supabase Auth UI to create a user with email: inspector@test.com

-- Then in profiles table, insert:
INSERT INTO profiles (id, role, society_name, society_id)
VALUES (
  '<USER_ID_FROM_AUTH>',
  'inspection',
  'Main Office',
  1  -- Use an existing society_id
);
```

## Step 6: Verify Setup

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('inspection_forms', 'inspection_form_items');

-- Check profiles has inspection role
SELECT DISTINCT role FROM profiles;

-- Check sample data
SELECT * FROM inspection_forms LIMIT 5;
SELECT * FROM inspection_form_items LIMIT 5;
```

## Important Notes

⚠️ **Before Running in Production:**

1. **Backup your database** - Always backup before running migrations
2. **Test in staging first** - Test all workflows before production
3. **RLS policies** - The RLS policies above need adjustment if your table structure is different
4. **User creation** - Inspection users need to be created via Supabase Auth UI first
5. **society_id validation** - Ensure all society_ids are valid integers

## Future Enhancements

Structure is ready for:
- ✅ PDF generation (store PDF URLs)
- ✅ Photo uploads (add `photos` JSONB column)
- ✅ Signature capture (add `signature_url` column)
- ✅ Ticket creation (link to tickets table)
- ✅ Fault closure workflow (add `status` and `closed_by` columns)

Example extended schema:

```sql
ALTER TABLE inspection_forms ADD COLUMN IF NOT EXISTS (
  status VARCHAR(50) DEFAULT 'pending', -- pending, reviewed, closed
  photos JSONB,
  signature_url TEXT,
  pdf_url TEXT,
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMP WITH TIME ZONE
);
```

## Rollback (if needed)

```sql
-- Drop tables (WARNING: This deletes all data!)
DROP TABLE IF EXISTS inspection_form_items CASCADE;
DROP TABLE IF EXISTS inspection_forms CASCADE;
```

---

For questions or issues, contact your database administrator.
