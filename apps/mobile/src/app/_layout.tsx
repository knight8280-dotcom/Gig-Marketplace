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

  // `loading` is cleared by an effect, and effects never run during the static
  // web export — so on the server this would stay true, the tree would render
  // nothing, and every route would export as an identical empty shell with the
  // site-wide title. Crawlers and link previews read that HTML, so prerender
  // the routes instead and let the browser hold the splash while it hydrates.
  const prerendering = typeof window === 'undefined';
  if (loading && !prerendering) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Public marketing pages: no header, they render their own site nav. */}
      <Stack.Screen name="about" />
      <Stack.Screen name="pricing" />
      <Stack.Screen name="safety" />
      <Stack.Screen name="contact" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
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
