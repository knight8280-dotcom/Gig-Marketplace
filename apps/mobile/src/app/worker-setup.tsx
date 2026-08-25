import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Field, FormError } from '@/components/form';
import { PrimaryButton } from '@/components/primary-button';
import { api, ApiError } from '@/api/client';
import { useCategories, useWorkerProfile } from '@/api/hooks';
import { useDeviceLocation } from '@/hooks/use-device-location';

const TRANSPORTS = ['NONE', 'BICYCLE', 'CAR', 'TRUCK', 'VAN'] as const;

/** Worker profile setup: bio, radius, transport, skills, categories. */
export default function WorkerSetup() {
  const qc = useQueryClient();
  const profile = useWorkerProfile(true);
  const categories = useCategories();
  const skills = useQuery({
    queryKey: ['skills'],
    queryFn: () => api<{ items: Array<{ id: string; name: string }> }>('/skills', { auth: false }),
  });
  const { coords, isFallback } = useDeviceLocation();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('10');
  const [transport, setTransport] = useState<string[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setDisplayName(p.display_name);
    setBio(p.bio ?? '');
    setRadiusMiles(String(Math.round(p.service_radius_m / 1609.34)));
    setSkillIds(p.skill_ids);
    setCategoryIds(p.category_ids);
  }, [profile.data]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/me/worker-profile', {
        method: 'PUT',
        body: {
          display_name: displayName,
          bio: bio || undefined,
          transportation: transport.length > 0 ? transport : undefined,
          service_radius_m: Math.min(160934, Math.max(500, Math.round(Number(radiusMiles) * 1609.34))),
          home_location: coords ?? undefined,
        },
      });
      if (skillIds.length > 0) {
        await api('/me/worker-profile/skills', { method: 'PUT', body: { skill_ids: skillIds } });
      }
      if (categoryIds.length > 0) {
        await api('/me/worker-profile/categories', { method: 'PUT', body: { category_ids: categoryIds } });
      }
      await qc.invalidateQueries({ queryKey: ['worker-profile'] });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.form}>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
        <Field label="Bio" value={bio} onChangeText={setBio} multiline numberOfLines={3} />
        <Field
          label="Service radius (miles)"
          value={radiusMiles}
          onChangeText={setRadiusMiles}
          keyboardType="number-pad"
        />
        {isFallback ? (
          <ThemedText type="small" style={styles.note}>
            Location unavailable — your home base will use the pilot-city default until you enable
            location. It is never shown to customers.
          </ThemedText>
        ) : (
          <ThemedText type="small" style={styles.note}>
            Your current location becomes your private home base for matching — never shown to
            customers.
          </ThemedText>
        )}

        <ThemedText type="smallBold">Transportation</ThemedText>
        <View style={styles.chips}>
          {TRANSPORTS.map((t) => (
            <Chip key={t} label={t} active={transport.includes(t)} onPress={() => toggle(transport, setTransport, t)} />
          ))}
        </View>

        <ThemedText type="smallBold">Job categories</ThemedText>
        <View style={styles.chips}>
          {(categories.data?.items ?? []).map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={categoryIds.includes(c.id)}
              onPress={() => toggle(categoryIds, setCategoryIds, c.id)}
            />
          ))}
        </View>

        <ThemedText type="smallBold">Skills</ThemedText>
        <View style={styles.chips}>
          {(skills.data?.items ?? []).map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              active={skillIds.includes(s.id)}
              onPress={() => toggle(skillIds, setSkillIds, s.id)}
            />
          ))}
        </View>

        <FormError message={error} />
        <PrimaryButton label="Save" onPress={save} loading={busy} disabled={displayName.length < 2} />
      </ScrollView>
    </ThemedView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <ThemedText type="small" style={active ? styles.chipActiveText : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  form: { padding: 16, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#8884', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { borderColor: '#3c87f7', backgroundColor: '#3c87f71a' },
  chipActiveText: { color: '#3c87f7' },
  note: { opacity: 0.6 },
});
