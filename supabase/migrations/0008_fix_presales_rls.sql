-- Fix at_after_sales RLS for presales role.
-- The old policy used who_booked_demo which stores Airtable record IDs,
-- not agent names. Presales attribution now goes through the
-- student_link_ids → at_demo_bookings.presales_agent chain.

drop policy if exists at_after_sales_read on at_after_sales;
create policy at_after_sales_read on at_after_sales for select using (
  is_management()
  or exists (
    select 1 from user_profiles up
    join employees e on e.id = up.employee_id
    where up.user_id = auth.uid()
      and (
        e.app_role = 'ar'
        or (e.app_role = 'sales' and lower(at_after_sales.agent) = lower(e.full_name))
        or (
          e.app_role = 'presales'
          and exists (
            select 1 from at_demo_bookings db
            where db.airtable_id = any(at_after_sales.student_link_ids)
              and lower(db.presales_agent) = lower(
                coalesce(e.airtable_agent_name, e.full_name)
              )
          )
        )
      )
  )
);
