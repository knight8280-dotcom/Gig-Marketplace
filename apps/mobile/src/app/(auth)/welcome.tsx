import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/primary-button';

export default function Welcome() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.hero}>
        <ThemedText type="subtitle">Local Gig Marketplace</ThemedText>
        <ThemedText style={styles.tagline}>
          Post a local job in minutes — or find nearby work and get paid.
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <Link href="/(auth)/register" asChild>
          <PrimaryButton label="Create an account" />
        </Link>
        <Link href="/(auth)/login" asChild>
          <PrimaryButton label="Sign in" variant="secondary" />
        </Link>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', gap: 12 },
  tagline: { opacity: 0.7 },
  actions: { gap: 12, paddingBottom: 32 },
});
