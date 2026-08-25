import { initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';

/**
 * Native Stripe payment sheet for saving a card (SetupIntent flow).
 * Requires EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY and the StripeProvider wrapper.
 */
export const cardEntrySupported = Boolean(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export async function presentCardSetup(clientSecret: string): Promise<{ completed: boolean; message?: string }> {
  if (!cardEntrySupported) {
    return { completed: false, message: 'Stripe publishable key is not configured for this build.' };
  }
  const init = await initPaymentSheet({
    setupIntentClientSecret: clientSecret,
    merchantDisplayName: 'Local Gig Marketplace',
  });
  if (init.error) return { completed: false, message: init.error.message };
  const result = await presentPaymentSheet();
  if (result.error) {
    return { completed: false, message: result.error.code === 'Canceled' ? undefined : result.error.message };
  }
  return { completed: true };
}
