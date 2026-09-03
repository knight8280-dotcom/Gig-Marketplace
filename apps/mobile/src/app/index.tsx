import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { Landing } from '@/screens/landing';
import { useAuth } from '@/state/auth';

/** Entry route: send the user to the right experience for their session/mode. */
export default function Index() {
  const { user, mode, loading } = useAuth();

  // Native waits for the session so a signed-in user is not flashed the
  // welcome screen. On the web the landing page renders meanwhile: it is the
  // prerendered HTML, so hydration matches, and a signed-in visitor is
  // redirected the moment the session resolves.
  if (loading && Platform.OS !== 'web') return null;

  if (!user) {
    // On the web this URL is the front door for people who have never heard of
    // the product, so it serves the marketing page. In the native app the user
    // already installed it — a pitch would just be in the way.
    return Platform.OS === 'web' ? <Landing /> : <Redirect href="/(auth)/welcome" />;
  }
  if (mode === 'WORKER') return <Redirect href="/(worker)/home" />;
  return <Redirect href="/(customer)/home" />;
}
