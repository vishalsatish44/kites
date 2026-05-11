-- =====================================================================
-- Auto-link auth.users → employees on signup, by matching email.
-- Run this AFTER 0001_init.sql.
-- =====================================================================

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  emp_id uuid;
begin
  select id into emp_id from employees where lower(email) = lower(new.email) limit 1;
  insert into user_profiles (user_id, employee_id) values (new.id, emp_id)
  on conflict (user_id) do update set employee_id = excluded.employee_id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
