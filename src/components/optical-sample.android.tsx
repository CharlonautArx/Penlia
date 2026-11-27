import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ViewProps } from 'react-native';

export const OpticalSample = requireNativeView<ViewProps & { enabled?: boolean }>('PenliaOpticalSample');

const hardware = requireOptionalNativeModule<{ backdropBudgetAllows: () => boolean }>('PenliaOpticalSample');
export const backdropBudgetAllows = () => hardware?.backdropBudgetAllows() ?? false;
