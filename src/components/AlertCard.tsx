import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, R } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { CommunityAlert, TRUST_LABEL, timeAgo, trustLevel, typeInfo } from '../services/alertsLogic';
import { SEV_COLOR } from './ui';

const TRUST_COLOR = { verified: C.ok, corroborated: C.sky, unverified: C.textDim } as const;

/** One community alert. The trust line is always shown so unverified reports never look official. */
export function AlertCard({ a, onPress }: { a: CommunityAlert; onPress?: () => void }) {
  const info = typeInfo(a.type);
  const trust = trustLevel(a);
  const resolved = a.status === 'resolved';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: R.md, padding: 12, borderWidth: 1, borderColor: C.border, opacity: resolved ? 0.6 : 1 }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: info.color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={info.icon as never} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{info.label}{resolved ? ' (resolved)' : ''}</Text>
          <Text style={{ color: C.textDim, fontSize: 12 }}>{timeAgo(a.created_at)}</Text>
        </View>
        <Text numberOfLines={2} style={{ color: C.textDim, fontSize: 13 }}>{a.description}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ color: SEV_COLOR[a.severity], fontSize: 12, fontWeight: '700' }}>{a.severity.toUpperCase()}</Text>
          {a.distance_km != null && <Text style={{ color: C.textDim, fontSize: 12 }}>{formatDistance(a.distance_km * 1000)} away</Text>}
          <Text style={{ color: TRUST_COLOR[trust], fontSize: 12 }}>{TRUST_LABEL[trust]}{trust === 'unverified' || a.confirmations === 0 ? '' : ` (${a.confirmations})`}</Text>
        </View>
      </View>
    </Pressable>
  );
}
