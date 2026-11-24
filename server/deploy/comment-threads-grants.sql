-- Apply after migration 013 in environments using the restricted application role.
GRANT DELETE ON public.moment_comments TO penlia_app;
