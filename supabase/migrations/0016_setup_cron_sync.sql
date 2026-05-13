-- Enable the pg_net extension to allow HTTP requests from Postgres
create extension if not exists pg_net;

-- Enable the pg_cron extension
create extension if not exists pg_cron;

-- Note: The cron job will call your Edge Function every 10 minutes.
-- You MUST ensure the 'supabase_service_role_key' and 'supabase_url' exist in public.app_settings.

select cron.schedule(
  'sync-airtable-every-10-min',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url := (select value from public.app_settings where key = 'supabase_url') || '/functions/v1/sync-airtable',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'supabase_service_role_key')
      ),
      body := jsonb_build_object('trigger', 'cron')
    )
  $$
);
