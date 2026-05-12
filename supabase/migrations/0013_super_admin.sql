-- Add super_admin flag to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Grant super admin to specified accounts (matched by auth email)
UPDATE user_profiles up
SET is_super_admin = true
FROM auth.users au
WHERE up.user_id = au.id
AND au.email IN (
  'deepika@supersheldon.com',
  'pratishtha.tripathy@supersheldon.com',
  'vishal.satish@supersheldon.com'
);
