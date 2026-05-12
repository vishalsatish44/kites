-- View that exposes auth email alongside user_profiles for the Super Admins tab
CREATE OR REPLACE VIEW v_user_profiles_full AS
SELECT
  up.user_id,
  up.employee_id,
  up.is_super_admin,
  au.email        AS auth_email,
  e.full_name,
  e.app_role
FROM user_profiles up
JOIN auth.users au ON au.id = up.user_id
LEFT JOIN employees e ON e.id = up.employee_id;

-- Allow authenticated users to read (super admins need this in the UI)
GRANT SELECT ON v_user_profiles_full TO authenticated;
