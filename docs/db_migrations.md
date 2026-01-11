# DB Migrations & How to apply

This repository contains SQL migration files under `sql/`.

## Migration: Add `tipo` column to `entregas`
File: `sql/001_add_tipo_to_entregas.sql`

You can apply it in two ways:

1) Via Supabase SQL editor (recommended)
   - Go to your Supabase project → SQL Editor → New Query
   - Paste the contents of `sql/001_add_tipo_to_entregas.sql` and run it

2) Locally via `psql` or a Postgres client using your `DATABASE_URL`:
   - `psql $DATABASE_URL -f sql/001_add_tipo_to_entregas.sql`

3) Optional Node helper (applies automatically using `DATABASE_URL`):
   - Install dependency: `npm i pg`
   - Run: `DATABASE_URL="postgres://..." node scripts/apply_sql.js sql/001_add_tipo_to_entregas.sql`

Notes:
- The SQL sets existing NULL values to 'Entrega'.
- Consider adding an explicit CHECK constraint (optional) to limit values to `('Entrega', 'Recolha', 'Outros')` after you verify the data.
- Always test in a staging environment before applying in production.
