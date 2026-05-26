-- 010_site_config.sql
-- Site-wide configuration table, readable by anonymous visitors.
-- Admins can update rows in Supabase Studio or via a future admin UI.

CREATE TABLE IF NOT EXISTS public.site_config (
    key   text  PRIMARY KEY,
    value jsonb NOT NULL
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can read config
CREATE POLICY "site_config_read_all"
    ON public.site_config FOR SELECT
    USING (true);

-- Only admins can write
CREATE POLICY "site_config_admin_write"
    ON public.site_config FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Seed: all four providers enabled by default.
-- To disable a provider, remove it from this array in Supabase Studio:
--   UPDATE site_config SET value = '["google","email"]' WHERE key = 'auth_providers';
INSERT INTO public.site_config (key, value)
VALUES ('auth_providers', '["google", "azure_personal", "azure_ad", "email"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
