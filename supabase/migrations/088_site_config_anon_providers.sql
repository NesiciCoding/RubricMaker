-- #626: the logged-out login page reads site_config.auth_providers to decide which sign-in
-- buttons to show. 053 granted table privileges to authenticated/service_role only, so on
-- deployments migrated as postgres (Supabase Cloud, `supabase db push`) the anon role got 42501
-- and the page fell back to showing every provider.
--
-- anon now gets SELECT, but RLS limits it to the one public key: site_config values can hold API
-- keys (see 081), so anonymous visitors must not read the rest of the table. Signed-in users keep
-- reading every key as before.

GRANT SELECT ON public.site_config TO anon;

DROP POLICY IF EXISTS "site_config_read_all" ON public.site_config;
DROP POLICY IF EXISTS site_config_read_authenticated ON public.site_config;
CREATE POLICY site_config_read_authenticated ON public.site_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS site_config_read_public ON public.site_config;
CREATE POLICY site_config_read_public ON public.site_config FOR SELECT TO anon
  USING (key = 'auth_providers');
