import { View, type ViewProps } from 'react-native';
export function OpticalSample({ children, ...props }: ViewProps & { enabled?: boolean }) {
  return <View style={props.style} pointerEvents="none">{children}</View>;
}

export const backdropBudgetAllows = () => true;
