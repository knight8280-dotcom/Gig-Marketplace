import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/state/auth';

export default function CustomerTabs() {
  const { user, mode } = useAuth();
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (mode !== 'CUSTOMER') return <Redirect href="/" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#3c87f7' }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="my-jobs" options={{ title: 'My Jobs' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
