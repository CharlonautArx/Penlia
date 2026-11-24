-- Apply after migration 015 in environments using the restricted application role.
GRANT SELECT, INSERT, UPDATE ON public.moment_space_preferences TO penlia_app;
GRANT SELECT, INSERT ON public.p1_report_history_hidden TO penlia_app;
