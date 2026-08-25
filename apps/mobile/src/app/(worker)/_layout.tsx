import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/state/auth';

export default function WorkerTabs() {
  const { user, mode } = useAuth();
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (mode !== 'WORKER') return <Redirect href="/" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#3c87f7' }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
