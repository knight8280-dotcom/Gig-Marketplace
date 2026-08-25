import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/state/auth';
import { AppStripeProvider } from '@/components/stripe-provider';
import { SiteHead } from '@/components/site-head';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function RootNavigator() {
  const { loading } = useAuth();

  useEffect(() => {
    // hideAsync resolves harmlessly once the splash is already gone, so no
    // "already hidden" flag is needed to guard the repeat call.
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(worker)" />
      <Stack.Screen name="job/[id]" options={{ headerShown: true, title: 'Job' }} />
      <Stack.Screen name="conversation/[id]" options={{ headerShown: true, title: 'Messages' }} />
      <Stack.Screen
        name="post-job"
        options={{ headerShown: true, title: 'Post a job', presentation: 'modal' }}
      />
      <Stack.Screen
        name="payment-methods"
        options={{ headerShown: true, title: 'Payments & payouts' }}
      />
      <Stack.Screen
        name="worker-setup"
        options={{ headerShown: true, title: 'Worker setup' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Site-wide default head; screens override it by rendering their own. */}
      <SiteHead />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppStripeProvider>
            <RootNavigator />
          </AppStripeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
