-- Apply after migration 014 in environments using the restricted application role.
GRANT SELECT, INSERT ON public.chat_records TO penlia_app;
