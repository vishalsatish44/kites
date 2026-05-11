-- =====================================================================
-- Fix RLS infinite recursion.
--
-- Problem:
--   - employees has an RLS policy `is_management() OR id = my_employee_id()`
--   - is_management() runs `select … from user_profiles join employees …`
--   - That SELECT re-triggers the employees policy → recursion → 500
--
-- Fix: make both helpers SECURITY DEFINER so they execute with the function
-- owner's privileges and bypass RLS internally. They still only return data
-- about the *currently-authenticated* user (auth.uid()), so this is safe.
-- =====================================================================

create or replace function is_management() returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.user_profiles up
      join public.employees e on e.id = up.employee_id
     where up.user_id = auth.uid()
       and e.app_role = 'management'
  );
$$;

create or replace function my_employee_id() returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select employee_id from public.user_profiles where user_id = auth.uid();
$$;

-- Lock down execution rights — only authenticated users can call them.
revoke all on function is_management() from public;
revoke all on function my_employee_id() from public;
grant execute on function is_management() to authenticated;
grant execute on function my_employee_id() to authenticated;
