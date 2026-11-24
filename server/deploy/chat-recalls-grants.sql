GRANT SELECT, INSERT, DELETE, UPDATE(sent_at) ON public.peer_send_receipts TO penlia_app;
GRANT SELECT, INSERT ON public.peer_recalls TO penlia_app;
GRANT USAGE ON SEQUENCE public.peer_recalls_sequence_seq TO penlia_app;
GRANT UPDATE(recalled_at) ON public.chat_group_messages TO penlia_app;
