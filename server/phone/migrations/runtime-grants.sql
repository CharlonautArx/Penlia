BEGIN;
SELECT CASE WHEN current_database() IN ('penlia_dev', 'penlia_phone_test')
  THEN '1' ELSE 'Select the approved Penlia database' END::integer AS target_database_check;
SET LOCAL penlia.phone_migration = 'active';
SELECT CASE WHEN current_setting('penlia.phone_migration', true) = 'active'
  THEN '1' ELSE 'Execute in a single transaction' END::integer AS transaction_check;
GRANT SELECT ON public.phone_auth_control TO penlia_app;
GRANT SELECT, INSERT ON public.phone_identities TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.phone_challenges, public.phone_captcha_checks,
  public.phone_sms_attempts, public.phone_onboarding, public.phone_risk_windows TO penlia_app;
GRANT SELECT, INSERT ON public.phone_budget_alerts TO penlia_app;
COMMIT;
