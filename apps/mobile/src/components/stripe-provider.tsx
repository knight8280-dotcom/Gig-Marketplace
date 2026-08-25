/** Web: no native Stripe SDK — render children directly. */
export function AppStripeProvider({ children }: { children: React.ReactElement }) {
  return children;
}
