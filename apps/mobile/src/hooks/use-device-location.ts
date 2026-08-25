import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

const FALLBACK = {
  lat: Number(process.env.EXPO_PUBLIC_DEFAULT_LAT ?? 30.2672),
  lng: Number(process.env.EXPO_PUBLIC_DEFAULT_LNG ?? -97.7431),
};

export interface DeviceLocation {
  coords: { lat: number; lng: number } | null;
  /** true when GPS was unavailable and the configured demo/pilot-city
   *  fallback is being used — callers must tell the user. */
  isFallback: boolean;
  ready: boolean;
}

/** Device GPS with an explicit, labeled fallback (never silently wrong). */
export function useDeviceLocation(): DeviceLocation {
  const [state, setState] = useState<DeviceLocation>({ coords: null, isFallback: false, ready: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('denied');
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setState({
            coords: { lat: position.coords.latitude, lng: position.coords.longitude },
            isFallback: false,
            ready: true,
          });
        }
      } catch {
        if (!cancelled) setState({ coords: FALLBACK, isFallback: true, ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
