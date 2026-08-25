import { Redirect } from 'expo-router';
import { useAuth } from '@/state/auth';

/** Entry route: send the user to the right experience for their session/mode. */
export default function Index() {
  const { user, mode } = useAuth();
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (mode === 'WORKER') return <Redirect href="/(worker)/home" />;
  return <Redirect href="/(customer)/home" />;
}
