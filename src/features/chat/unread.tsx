import { createContext, useContext } from 'react';

export const ConversationUnread = createContext<(count: number, marked: boolean) => void>(() => {});
export const useReportConversationUnread = () => useContext(ConversationUnread);
