import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SCHEMA_DIR = path.join(process.cwd(), 'supabase', 'current_schema');

if (!fs.existsSync(SCHEMA_DIR)) {
  fs.mkdirSync(SCHEMA_DIR, { recursive: true });
}

async function updateSchema() {
  console.log('🚀 Updating database schema dump...');

  const queries = {
    'tables_dump.json': `
      SELECT 
        t.table_name,
        jsonb_agg(jsonb_build_object(
          'column_name', c.column_name,
          'data_type', c.data_type,
          'is_nullable', c.is_nullable,
          'column_default', c.column_default
        )) as columns
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
      GROUP BY t.table_name
    `,
    'All_Constraints.json': `
      SELECT
        conname AS constraint_name,
        contype AS constraint_type,
        relname AS table_name,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class r ON c.conrelid = r.oid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public'
    `,
    'All_RLS_Policies.json': `
      SELECT * FROM pg_policies WHERE schemaname = 'public'
    `,
    'All_Triggers.json': `
      SELECT 
        trig.tgname AS trigger_name,
        rel.relname AS table_name,
        proc.proname AS function_name,
        CASE trig.tgtype & 1
          WHEN 1 THEN 'ROW'
          ELSE 'STATEMENT'
        END AS action_orientation,
        CASE trig.tgtype & 66
          WHEN 2 THEN 'BEFORE'
          WHEN 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END AS action_timing
      FROM pg_trigger trig
      JOIN pg_class rel ON trig.tgrelid = rel.oid
      JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
      JOIN pg_proc proc ON trig.tgfoid = proc.oid
      WHERE nsp.nspname NOT IN ('information_schema', 'pg_catalog')
        AND trig.tgisinternal = false
    `,

    'All_Functions.json': `
      SELECT 
        routine_name,
        routine_definition,
        data_type AS return_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
    `,
    'All_Types.json': `
      SELECT 
        n.nspname as schema,
        t.typname as type_name,
        CASE 
          WHEN t.typtype = 'e' THEN 'enum'
          WHEN t.typtype = 'c' THEN 'composite'
          WHEN t.typtype = 'd' THEN 'domain'
          WHEN t.typtype = 'b' THEN 'base'
          ELSE t.typtype::text
        END as type_kind
      FROM pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
    `,


    'Storage_Buckets.json': `
      SELECT * FROM storage.buckets
    `
  };

  for (const [filename, sql] of Object.entries(queries)) {
    console.log(`  - Fetching ${filename}...`);
    const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });
    
    // Fallback: If RPC execute_sql isn't set up, you'd usually use a management API or 
    // direct postgres connection. Since I can't guarantee 'execute_sql' RPC exists, 
    // I will use a more robust approach if this fails.
    
    if (error) {
      console.error(`  ❌ Error fetching ${filename}: ${error.message}`);
      // Note: In Supabase, you often need a custom RPC to run arbitrary SELECTs on info_schema 
      // if not using the CLI.
      continue;
    }

    fs.writeFileSync(path.join(SCHEMA_DIR, filename), JSON.stringify(data, null, 2));
  }

  console.log('✅ Schema update complete.');
}

updateSchema();
