import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S } from '../constants/theme';

export function Screen({ children, scroll = true, pad = true }: { children: ReactNode; scroll?: boolean; pad?: boolean }) {
  const inner = scroll ? (
    <ScrollView contentContainerStyle={[pad && { padding: S.lg }, { paddingBottom: 48, gap: S.md }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  ) : (
    <View style={[{ flex: 1 }, pad && { padding: S.lg, gap: S.md }]}>{children}</View>
  );
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.bg }}>{inner}</SafeAreaView>;
}

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: string }) {
  return <View style={[st.card, accent ? { borderLeftColor: accent, borderLeftWidth: 4 } : null, style]}>{children}</View>;
}

export const H = ({ children }: { children: ReactNode }) => <Text style={st.h}>{children}</Text>;
export const T = ({ children, dim, small, bold, color, style }: { children: ReactNode; dim?: boolean; small?: boolean; bold?: boolean; color?: string; style?: object }) => (
  <Text style={[{ color: color ?? (dim ? C.textDim : C.text), fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21 }, bold && { fontWeight: '700' }, style]}>{children}</Text>
);

export function Btn({ label, onPress, color = C.crimson, outline, disabled, busy, small }: { label: string; onPress: () => void; color?: string; outline?: boolean; disabled?: boolean; busy?: boolean; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [st.btn, small && { paddingVertical: 8 }, outline ? { borderColor: color, borderWidth: 1.5 } : { backgroundColor: color }, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={[st.btnText, outline && { color }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...p }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: C.textDim, fontSize: 13 }}>{label}</Text>
      <TextInput placeholderTextColor={C.textDim} {...p} style={[st.input, p.multiline && { minHeight: 80, textAlignVertical: 'top' }, p.style]} />
    </View>
  );
}

export function Chip({ label, active, onPress, color = C.teal }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[st.chip, active && { backgroundColor: color, borderColor: color }]}>
      <Text style={{ color: active ? '#fff' : C.textDim, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, gap = S.sm, wrap }: { children: ReactNode; gap?: number; wrap?: boolean }) {
  return <View style={{ flexDirection: 'row', gap, alignItems: 'center', flexWrap: wrap ? 'wrap' : 'nowrap' }}>{children}</View>;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <T bold>{title}</T>
      <T dim small>{body}</T>
    </Card>
  );
}

export function Notice({ kind, children }: { kind: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const color = { info: C.sky, warn: C.amber, error: C.crimson, ok: C.ok }[kind];
  return (
    <View style={[st.notice, { borderColor: color }]}>
      <Text style={{ color, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export const SEV_COLOR = { low: C.sky, medium: C.amber, high: '#F97316', critical: C.crimson } as const;

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: S.lg, gap: 6, borderWidth: 1, borderColor: C.border },
  h: { color: C.text, fontSize: 20, fontWeight: '800' },
  btn: { borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  input: { backgroundColor: C.surfaceHigh, color: C.text, borderRadius: R.sm, padding: 12, fontSize: 15, borderWidth: 1, borderColor: C.border },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 7 },
  notice: { borderWidth: 1, borderRadius: R.sm, padding: 10, backgroundColor: C.surface },
});
