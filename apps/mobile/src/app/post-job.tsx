import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Field, FormError } from '@/components/form';
import { PrimaryButton } from '@/components/primary-button';
import * as ImagePicker from 'expo-image-picker';
import { useCategories, useJobInvalidation } from '@/api/hooks';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { api, ApiError, uploadImage } from '@/api/client';
import { AuthedImage } from '@/components/authed-image';

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
  const { coords, isFallback } = useDeviceLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setUploading(true);
    try {
      const uploaded = await uploadImage(asset.uri, 'JOB_PHOTO');
      setPhotoIds((ids) => [...ids, uploaded.id]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

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
      for (const fileId of photoIds) {
        await api(`/jobs/${job.id}/photos`, { method: 'POST', body: { file_id: fileId } }).catch(
          () => undefined, // photo attach failures never block the post
        );
      }
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

        <ThemedText type="smallBold">Photos (optional)</ThemedText>
        <View style={styles.photoRow}>
          {photoIds.map((id) => (
            <AuthedImage key={id} fileId={id} style={styles.photo} />
          ))}
          <PrimaryButton
            label={uploading ? 'Uploading…' : 'Add photo'}
            variant="secondary"
            onPress={pickPhoto}
            loading={uploading}
            disabled={photoIds.length >= 8}
          />
        </View>

        <ThemedText type="small" style={styles.note}>
          {isFallback
            ? 'Location unavailable — the job pin will use the pilot-city default. Enable location for an accurate pin.'
            : 'The job pin uses your current location. Map-pin placement: Coming Soon.'}
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
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  photo: { width: 72, height: 72, borderRadius: 8 },
});
