import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type CallDevice = {
  addListener(name: 'onPipChanged', listener: (event: { active: boolean }) => void): { remove(): void };
  configurePip(enabled: boolean): Promise<boolean>;
  routeSpeaker(enabled: boolean): Promise<boolean>;
  releaseAudio(): Promise<void>;
};

export const callDevice = Platform.OS === 'android' ? requireOptionalNativeModule<CallDevice>('PenliaCall') : null;
