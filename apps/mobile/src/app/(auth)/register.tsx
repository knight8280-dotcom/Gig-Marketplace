import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { BackendNotice } from '@/components/backend-notice';
import { Field, FormError } from '@/components/form';
import { PrimaryButton } from '@/components/primary-button';
import { useAuth } from '@/state/auth';
import { ApiError } from '@/api/client';

export default function Register() {
  const { signUp } = useAuth();
  const [role, setRole] = useState<'CUSTOMER' | 'WORKER'>('CUSTOMER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp(email.trim(), password, role);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.form}>
        <ThemedText type="subtitle">Create account</ThemedText>
        <BackendNotice />

        <View style={styles.roleRow} accessibilityRole="radiogroup">
          {(
            [
              ['CUSTOMER', 'I need work done'],
              ['WORKER', 'I want to work'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: role === value }}
              onPress={() => setRole(value)}
              style={[styles.roleCard, role === value && styles.roleCardActive]}
            >
              <ThemedText type="smallBold" style={role === value ? styles.roleActiveText : undefined}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <Field
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Password (10+ characters)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <FormError message={error} />
        <PrimaryButton
          label="Create account"
          onPress={submit}
          loading={busy}
          disabled={!email || password.length < 10}
        />
        <ThemedText type="small" style={styles.note}>
          You can add the other side later — many people both post jobs and work.
        </ThemedText>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  form: { gap: 16 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8884',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  roleCardActive: { borderColor: '#3c87f7', backgroundColor: '#3c87f71a' },
  roleActiveText: { color: '#3c87f7' },
  note: { opacity: 0.6, textAlign: 'center' },
});
