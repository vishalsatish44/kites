alter table at_sync_runs
  add column if not exists rows_employees int default 0;
