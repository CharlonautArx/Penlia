import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

export const OpticalSample = requireNativeView<ViewProps & { enabled?: boolean }>('PenliaOpticalSample');
