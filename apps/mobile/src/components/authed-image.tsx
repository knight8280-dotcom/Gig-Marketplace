import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ImageStyle } from 'react-native';
import { getTokens } from '@/api/client';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Renders an access-controlled file (GET /v1/files/:id/content) by fetching it
 * with the bearer token and displaying a data URI — works on native and web.
 */
export function AuthedImage({ fileId, style }: { fileId: string; style?: StyleProp<ImageStyle> }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { access } = await getTokens();
        const res = await fetch(`${BASE_URL}/v1/files/${fileId}/content`, {
          headers: access ? { authorization: `Bearer ${access}` } : {},
        });
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') ?? 'image/jpeg';
        const buffer = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        const base64 = btoa(binary);
        if (!cancelled) setUri(`data:${contentType};base64,${base64}`);
      } catch {
        // Broken images render as an empty placeholder.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!uri) return <View style={[styles.placeholder, style]} />;
  return <Image source={{ uri }} style={style} accessibilityLabel="Job photo" />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#8882', borderRadius: 8 },
});
