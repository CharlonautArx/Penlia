import type { ReactNode } from 'react';

export type GroupGrant = {
  callId: string;
  roomId: string;
  participantId: string;
  token: string;
  expiresAt: number;
};
export type GroupRoom = {
  setMicrophone(enabled: boolean): Promise<void>;
  setCamera(enabled: boolean): Promise<void>;
  switchCamera(): Promise<void>;
  updateToken(grant: GroupGrant): Promise<void>;
  close(): Promise<void>;
};
export type GroupRtcProvider = {
  join(
    grant: GroupGrant,
    hooks: {
      onVideo: (views: ReactNode) => void;
      onState: (state: 'connecting' | 'connected' | 'reconnecting' | 'ended') => void;
    },
  ): Promise<GroupRoom>;
  requestPermissions(): Promise<boolean>;
};

// Supply a native RTC implementation in the final, credentialed integration build.
export function groupRtcProvider(): GroupRtcProvider | undefined {
  return undefined;
}
