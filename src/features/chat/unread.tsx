import { createContext, useContext } from 'react';

export const ConversationUnread = createContext<(count: number) => void>(() => {});
export const useReportConversationUnread = () => useContext(ConversationUnread);
