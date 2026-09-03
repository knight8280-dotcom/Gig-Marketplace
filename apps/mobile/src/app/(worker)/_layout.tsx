import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/state/auth';
import { tabIcon } from '@/components/tab-icon';
import { Brand } from '@/constants/theme';

export default function WorkerTabs() {
  const { user, mode, loading } = useAuth();
  // Wait for the session before deciding — redirecting on the not-yet-loaded
  // null would bounce a signed-in user to the welcome screen.
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (mode !== 'WORKER') return <Redirect href="/" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: Brand.primary }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: tabIcon('briefcase') }} />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: tabIcon('chatbubbles') }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Activity', tabBarIcon: tabIcon('notifications') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person') }} />
    </Tabs>
  );
}
