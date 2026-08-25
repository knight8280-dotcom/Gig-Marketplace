import { StripeProvider } from '@stripe/stripe-react-native';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/** Native: wrap the app in StripeProvider when a publishable key is configured. */
export function AppStripeProvider({ children }: { children: React.ReactElement }) {
  if (!publishableKey) return children;
  return <StripeProvider publishableKey={publishableKey}>{children}</StripeProvider>;
}
