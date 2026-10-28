import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants/theme';

export type TabId = 'home' | 'map' | 'alerts' | 'profile';
const TABS: { id: TabId; label: string; icon: string; iconOff: string }[] = [
  { id: 'home', label: 'Home', icon: 'home', iconOff: 'home-outline' },
  { id: 'map', label: 'Map', icon: 'map', iconOff: 'map-outline' },
  { id: 'alerts', label: 'Alerts', icon: 'notifications', iconOff: 'notifications-outline' },
  { id: 'profile', label: 'Profile', icon: 'person', iconOff: 'person-outline' },
];

export function TabBar({ active, onChange, badge }: { active: TabId; onChange: (t: TabId) => void; badge: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.navy, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 8 }}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => onChange(t.id)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <View>
              <Ionicons name={(on ? t.icon : t.iconOff) as never} size={24} color={on ? C.brand : C.textDim} />
              {t.id === 'alerts' && badge > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.crimson, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: on ? C.brand : C.textDim, fontSize: 11 }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
