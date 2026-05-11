-- Add student_link_ids to at_after_sales so the sync can store
-- the multipleRecordLinks pointing to Demo Booking records.
-- Used by the frontend to attribute conversions to pre-sales agents.
alter table at_after_sales
  add column if not exists student_link_ids text[] default '{}';
