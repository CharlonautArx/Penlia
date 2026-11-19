export type CallKind = 'voice' | 'video';
export type CallPhase = 'outgoing' | 'incoming' | 'connecting' | 'active' | 'reconnecting' | 'ended' | 'failed';
export type CallState = { id: string; type: CallKind; phase: CallPhase; reason?: 'declined' | 'ended' | 'timeout' | 'network' };
export type CallEvent = { id: string; action: 'accept' | 'joined' | 'interrupt' | 'recover' | 'decline' | 'end' | 'timeout' | 'fail' };

export function transitionCall(state: CallState, event: CallEvent): CallState {
  if (state.id !== event.id || state.phase === 'ended' || state.phase === 'failed') return state;
  const ringing = state.phase === 'outgoing' || state.phase === 'incoming';
  switch (event.action) {
    case 'accept': return ringing ? { ...state, phase: 'connecting' } : state;
    case 'joined': return state.phase === 'connecting' ? { ...state, phase: 'active' } : state;
    case 'interrupt': return state.phase === 'active' ? { ...state, phase: 'reconnecting' } : state;
    case 'recover': return state.phase === 'reconnecting' ? { ...state, phase: 'active' } : state;
    case 'decline': return ringing ? { ...state, phase: 'ended', reason: 'declined' } : state;
    case 'timeout': return ringing ? { ...state, phase: 'ended', reason: 'timeout' } : state;
    case 'end': return { ...state, phase: 'ended', reason: 'ended' };
    case 'fail': return { ...state, phase: 'failed', reason: 'network' };
  }
}

// The server authenticates both UUIDs and the accepted friendship before granting a room.
export type RtcGrant = { callId: string; roomId: string; participantId: string; token: string; expiresAt: number };
export type CallSignal =
  | { kind: 'invite'; call: CallState & { phase: 'incoming' }; callerUserId: string; expiresAt: number }
  | { kind: 'event'; event: CallEvent };

export interface CallSignaling {
  invite(peerUserId: string, type: CallKind): Promise<CallState>;
  accept(callId: string): Promise<RtcGrant>;
  grant(callId: string): Promise<RtcGrant>;
  decline(callId: string): Promise<void>;
  end(callId: string): Promise<void>;
  subscribe(listener: (signal: CallSignal) => void): () => void;
}
export interface RtcEngine {
  join(grant: RtcGrant, kind: CallKind): Promise<void>;
  renew(grant: RtcGrant): Promise<void>;
  leave(): Promise<void>;
  mute(muted: boolean): Promise<void>;
  routeSpeaker(on: boolean): Promise<void>;
  enableCamera(enabled: boolean): Promise<void>;
  switchCamera(): Promise<void>;
  subscribe(listener: (event: 'joined' | 'interrupt' | 'recover' | 'fail') => void): () => void;
}
