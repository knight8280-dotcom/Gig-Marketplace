import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { apiConfigured } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shown on the sign-in and registration screens of a build that has no backend
 * configured — a static deploy of the marketing site, before an API is hosted.
 *
 * Renders nothing when the build is wired up, so it costs nothing in a real
 * deployment. Better to say this up front than to let someone fill in a form
 * that cannot possibly succeed.
 */
export function BackendNotice() {
  const theme = useTheme();
  if (apiConfigured) return null;

  return (
    <View style={[styles.notice, { backgroundColor: theme.warningSoft }]}>
      <Ionicons name="cloud-offline-outline" size={18} color={Brand.warning} />
      <ThemedText type="small" style={styles.text}>
        Accounts aren&rsquo;t available yet — this preview of the site isn&rsquo;t connected to a
        server. Everything on the home page is real; signing in comes with the full launch.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  text: { flex: 1, lineHeight: 20 },
});
