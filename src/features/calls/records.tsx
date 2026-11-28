import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, type ReactNode } from 'react';
import { useLocalDocument } from '../local/document';
import { appendCallRecord, type CallRecord } from './record';

const empty: readonly CallRecord[] = [];
const CallRecords = createContext<{ rows: readonly CallRecord[]; save?: (record: CallRecord) => Promise<void> }>({ rows: empty });

export function CallRecordsProvider({ account, children }: { account?: string; children: ReactNode }) {
  const key = account && 'penlia:call-records:v1:' + account;
  const store = useLocalDocument<CallRecord[]>(key, async () => JSON.parse(await AsyncStorage.getItem(key!) ?? '[]'));
  return <CallRecords.Provider value={{ rows: store.value ?? empty, save: (record) => {
    if (!account || (record.caller !== account && record.recipient !== account))
      return Promise.reject(new Error('当前账号无法保存该通话记录。'));
    return store.save((records) => appendCallRecord(records, record));
  } }}>{children}</CallRecords.Provider>;
}

export const useCallRecords = () => useContext(CallRecords);
