import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Field, FormError } from '@/components/form';
import { PrimaryButton } from '@/components/primary-button';
import { useCategories, useJobInvalidation } from '@/api/hooks';
import { api, ApiError } from '@/api/client';

/**
 * Guided job posting (MVP form). Coordinates come from the device location
 * for now — map-pin placement is a planned enhancement (Coming Soon), so the
 * job pin is only as accurate as where you are standing.
 */
export default function PostJob() {
  const categories = useCategories();
  const invalidate = useJobInvalidation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [urgency, setUrgency] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [startInHours, setStartInHours] = useState('24');
  const [durationHours, setDurationHours] = useState('2');
  const [workers, setWorkers] = useState('1');
  const [payType, setPayType] = useState<'FLAT' | 'HOURLY'>('FLAT');
  const [payDollars, setPayDollars] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    })();
  }, []);

  const submit = async () => {
    setError(null);
    if (!categoryId) return setError('Pick a category');
    if (!coords) return setError('Location permission is required to place the job pin');
    const payCents = Math.round(Number(payDollars) * 100);
    if (!Number.isFinite(payCents) || payCents < 100) return setError('Enter a valid pay amount');

    setBusy(true);
    try {
      const job = await api<{ id: string }>('/jobs', {
        method: 'POST',
        body: {
          title,
          description,
          category_id: categoryId,
          address_line1: addressLine1,
          city,
          region,
          postal_code: postalCode,
          location: coords,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          urgency,
          scheduled_start_at:
            urgency === 'SCHEDULED'
              ? new Date(Date.now() + Number(startInHours) * 3600e3).toISOString()
              : undefined,
          estimated_duration_minutes: Math.round(Number(durationHours) * 60),
          workers_needed: Number(workers),
          pay_type: payType,
          pay_cents: payCents,
        },
      });
      invalidate(job.id);
      router.dismiss();
      router.push(`/job/${job.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post the job');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.form}>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Unload a moving truck" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="Two people to unload boxes and some furniture. About two hours."
        />

        <ThemedText type="smallBold">Category</ThemedText>
        <View style={styles.chips}>
          {(categories.data?.items ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </View>

        <Field label="Street address" value={addressLine1} onChangeText={setAddressLine1} />
        <View style={styles.rowFields}>
          <View style={styles.flex}>
            <Field label="City" value={city} onChangeText={setCity} />
          </View>
          <View style={styles.stateField}>
            <Field label="State" value={region} onChangeText={setRegion} autoCapitalize="characters" />
          </View>
        </View>
        <Field label="ZIP" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />

        <ThemedText type="smallBold">When</ThemedText>
        <View style={styles.chips}>
          <Chip label="ASAP" active={urgency === 'ASAP'} onPress={() => setUrgency('ASAP')} />
          <Chip label="Scheduled" active={urgency === 'SCHEDULED'} onPress={() => setUrgency('SCHEDULED')} />
        </View>
        {urgency === 'SCHEDULED' ? (
          <Field
            label="Starts in (hours from now)"
            value={startInHours}
            onChangeText={setStartInHours}
            keyboardType="number-pad"
          />
        ) : null}

        <View style={styles.rowFields}>
          <View style={styles.flex}>
            <Field
              label="Est. duration (hours)"
              value={durationHours}
              onChangeText={setDurationHours}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.flex}>
            <Field label="Workers needed" value={workers} onChangeText={setWorkers} keyboardType="number-pad" />
          </View>
        </View>

        <ThemedText type="smallBold">Pay</ThemedText>
        <View style={styles.chips}>
          <Chip label="Flat total per worker" active={payType === 'FLAT'} onPress={() => setPayType('FLAT')} />
          <Chip label="Hourly rate" active={payType === 'HOURLY'} onPress={() => setPayType('HOURLY')} />
        </View>
        <Field
          label={payType === 'FLAT' ? 'Pay per worker ($)' : 'Hourly rate ($/hr)'}
          value={payDollars}
          onChangeText={setPayDollars}
          keyboardType="decimal-pad"
        />

        <ThemedText type="small" style={styles.note}>
          The job pin uses your current location. Map-pin placement: Coming Soon.
        </ThemedText>
        <FormError message={error} />
        <PrimaryButton
          label="Post job"
          onPress={submit}
          loading={busy}
          disabled={!title || !description || !addressLine1 || !city || !region || !postalCode || !payDollars}
        />
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
  chip: {
    borderWidth: 1,
    borderColor: '#8884',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { borderColor: '#3c87f7', backgroundColor: '#3c87f71a' },
  chipActiveText: { color: '#3c87f7' },
  rowFields: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  stateField: { width: 100 },
  note: { opacity: 0.6 },
});
