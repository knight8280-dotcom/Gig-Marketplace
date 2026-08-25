import React, { forwardRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { ThemedText } from './themed-text';

interface Props extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export const PrimaryButton = forwardRef<View, Props>(function PrimaryButton(
  { label, variant = 'primary', loading = false, disabled, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        (pressed || disabled || loading) && styles.pressed,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#3c87f7' : '#fff'} />
      ) : (
        <ThemedText
          type="smallBold"
          style={[styles.label, variant === 'secondary' ? styles.labelSecondary : styles.labelPrimary]}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: '#3c87f7' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3c87f7' },
  danger: { backgroundColor: '#d64545' },
  pressed: { opacity: 0.7 },
  label: { textAlign: 'center' },
  labelPrimary: { color: '#fff' },
  labelSecondary: { color: '#3c87f7' },
});
