GRANT CONNECT ON DATABASE penlia_dev TO penlia_app;
GRANT USAGE ON SCHEMA public TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.users TO penlia_app;
GRANT SELECT, INSERT, DELETE ON public.sessions TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.friendships TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.rate_limits TO penlia_app;
