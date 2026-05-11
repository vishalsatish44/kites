create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

insert into app_settings (key, value)
  values ('sync_interval_minutes', '10')
  on conflict (key) do nothing;

alter table app_settings enable row level security;

drop policy if exists app_settings_read  on app_settings;
drop policy if exists app_settings_write on app_settings;

create policy app_settings_read  on app_settings for select using (true);
create policy app_settings_write on app_settings for all    using (is_management());
