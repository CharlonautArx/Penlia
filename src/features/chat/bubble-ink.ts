import { createContext, useContext } from 'react';

export const ChatBubbleInk = createContext<string | undefined>(undefined);
export const useChatBubbleInk = () => useContext(ChatBubbleInk);
