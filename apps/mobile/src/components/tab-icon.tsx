import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';

/**
 * Tab bar icon.
 *
 * Without an explicit `tabBarIcon` the navigator falls back to a placeholder
 * glyph, which renders as a stray chevron on web. Ionicons ships outline and
 * filled variants of the same shape, so the active tab reads as filled.
 */
export type TabIconName = 'home' | 'briefcase' | 'chatbubbles' | 'notifications' | 'person';

export function tabIcon(name: TabIconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color as string} />;
  };
}
