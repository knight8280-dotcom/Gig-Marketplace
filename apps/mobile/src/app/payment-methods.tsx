import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { FormError } from '@/components/form';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/state/auth';
import { cardEntrySupported, presentCardSetup } from '@/lib/stripe-sheet';

/** Customer card setup (Stripe payment sheet) + worker payout onboarding. */
function PaymentMethods() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const profile = useQuery({
    queryKey: ['payment-profile'],
    queryFn: () => api<{ has_payment_method: boolean }>('/me/payment-profile'),
  });
  const payoutAccount = useQuery({
    queryKey: ['payout-account'],
    queryFn: () => api<{ exists: boolean; payouts_enabled?: boolean; onboarding_status?: string }>('/me/payout-account'),
    enabled: user?.roles.includes('WORKER') ?? false,
  });

  const addCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const si = await api<{ id: string; client_secret: string }>('/me/payment-methods/setup-intent', {
        method: 'POST',
        body: {},
      });
      const result = await presentCardSetup(si.client_secret);
      if (!result.completed) {
        if (result.message) setError(result.message);
        return;
      }
      await api('/me/payment-methods/sync-setup-intent', {
        method: 'POST',
        body: { setup_intent_id: si.id },
      });
      await qc.invalidateQueries({ queryKey: ['payment-profile'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the card');
    } finally {
      setBusy(false);
    }
  };

  const startPayoutOnboarding = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = process.env.EXPO_PUBLIC_APP_URL ?? 'https://example.com';
      const link = await api<{ url: string }>('/me/payout-account/onboarding-link', {
        method: 'POST',
        body: { refresh_url: `${base}/payout-refresh`, return_url: `${base}/payout-return` },
      });
      await WebBrowser.openBrowserAsync(link.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start payout onboarding');
    } finally {
      setBusy(false);
    }
  };

  const refreshPayoutStatus = async () => {
    setBusy(true);
    try {
      await api('/me/payout-account/refresh', { method: 'POST', body: {} });
      await qc.invalidateQueries({ queryKey: ['payout-account'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not refresh status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
        {user?.roles.includes('CUSTOMER') ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Payment method</ThemedText>
            <ThemedText type="small" style={styles.dim}>
              {profile.data?.has_payment_method
                ? 'A card is on file. Jobs are charged when they fill.'
                : 'No card on file — add one so your jobs can be charged when workers commit.'}
            </ThemedText>
            <PrimaryButton
              label={profile.data?.has_payment_method ? 'Replace card' : 'Add card'}
              onPress={addCard}
              loading={busy}
            />
            {!cardEntrySupported ? (
              <ThemedText type="small" style={styles.dim}>
                Card entry uses the Stripe payment sheet in the iOS/Android app.
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {user?.roles.includes('WORKER') ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Payouts</ThemedText>
            <ThemedText type="small" style={styles.dim}>
              {payoutAccount.data?.payouts_enabled
                ? 'Your payout account is active — earnings transfer after each confirmed job.'
                : 'Set up your payout account with Stripe to receive earnings.'}
            </ThemedText>
            <PrimaryButton
              label={payoutAccount.data?.exists ? 'Continue payout setup' : 'Set up payouts'}
              onPress={startPayoutOnboarding}
              loading={busy}
            />
            {payoutAccount.data?.exists ? (
              <PrimaryButton label="Refresh status" variant="secondary" onPress={refreshPayoutStatus} />
            ) : null}
          </View>
        ) : null}

        <FormError message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  section: { gap: 10 },
  dim: { opacity: 0.65 },
});

/** Signed-in screen: wait for the session rather than render it with no user. */
export default function PaymentMethodsRoute() {
  const { loading } = useAuth();
  if (loading) return null;
  return <PaymentMethods />;
}
