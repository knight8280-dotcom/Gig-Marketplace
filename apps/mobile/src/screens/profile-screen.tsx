import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { useAuth } from '@/state/auth';

export function ProfileScreen() {
  const { user, mode, setMode, signOut } = useAuth();
  if (!user) return null;

  const hasBothRoles = user.roles.includes('CUSTOMER') && user.roles.includes('WORKER');
  const otherMode = mode === 'WORKER' ? 'CUSTOMER' : 'WORKER';

  return (
    <Screen contentStyle={styles.content}>
        <ThemedText type="subtitle">Profile</ThemedText>

        <View style={styles.section}>
          <Row label="Email" value={user.email} />
          <Row label="Email verified" value={user.email_verified ? 'Yes' : 'Not yet'} />
          <Row label="Phone verified" value={user.phone_verified ? 'Yes' : 'Not yet'} />
          <Row label="Roles" value={user.roles.join(', ')} />
          <Row label="Current mode" value={mode ?? '—'} />
        </View>

        {!user.email_verified || !user.phone_verified ? (
          <View style={styles.notice}>
            <ThemedText type="smallBold">Finish verification</ThemedText>
            <ThemedText type="small" style={styles.noticeText}>
              Verify your email and phone to post or accept jobs. Check your inbox for the
              verification token, then complete it in onboarding.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.actions}>
          {user.roles.includes('WORKER') ? (
            <PrimaryButton
              label="Worker setup (skills, radius, categories)"
              variant="secondary"
              onPress={() => router.push('/worker-setup')}
            />
          ) : null}
          <PrimaryButton
            label="Payments & payouts"
            variant="secondary"
            onPress={() => router.push('/payment-methods')}
          />
          {hasBothRoles ? (
            <PrimaryButton
              label={`Switch to ${otherMode === 'WORKER' ? 'worker' : 'customer'} mode`}
              variant="secondary"
              onPress={() => {
                setMode(otherMode);
                router.replace('/');
              }}
            />
          ) : null}
          <PrimaryButton
            label="Sign out"
            variant="danger"
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/welcome');
            }}
          />
        </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20 },
  section: { gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { opacity: 0.6 },
  notice: { borderRadius: 12, padding: 14, backgroundColor: '#f7b73c22', gap: 4 },
  noticeText: { opacity: 0.8 },
  actions: { gap: 12, marginTop: 12 },
});
