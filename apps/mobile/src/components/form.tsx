import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';

export function Field({
  label,
  error,
  ...inputProps
}: TextInputProps & { label: string; error?: string | null }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#888"
        style={[styles.input, { color: theme.text, borderColor: error ? '#d64545' : '#8884' }]}
        {...inputProps}
      />
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <ThemedText type="small" style={styles.error} accessibilityLiveRegion="polite">
      {message}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: '#d64545' },
});
