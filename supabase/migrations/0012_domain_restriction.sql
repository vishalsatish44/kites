-- Enforce @supersheldon.com domain at the database level.
-- This fires BEFORE INSERT on auth.users so even admin-created accounts
-- with a wrong domain are rejected immediately.

CREATE OR REPLACE FUNCTION auth.enforce_supersheldon_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  IF NEW.email IS NULL OR lower(NEW.email) NOT LIKE '%@supersheldon.com' THEN
    RAISE EXCEPTION 'Access denied: only @supersheldon.com accounts are permitted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_email_domain ON auth.users;

CREATE TRIGGER enforce_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.enforce_supersheldon_domain();
