import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C } from '../constants/theme';
import { checkAppLockPin, getPinLockoutSeconds } from '../services/pinLock';
import { H, T } from './ui';

/** PIN screen. There is no bypass. The duress PIN looks identical to a normal unlock. */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [lock, setLock] = useState(0);

  useEffect(() => { void getPinLockoutSeconds().then(setLock); }, []);
  useEffect(() => {
    if (lock <= 0) return;
    const t = setInterval(() => setLock((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lock]);

  const press = async (d: string) => {
    if (lock > 0) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (next.length >= 4) {
      // verify at every length from 4: the PIN length is not stored
      if (await checkAppLockPin(next)) { onUnlock(); return; }
      if (next.length === 8) {
        setPin('');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const s = await getPinLockoutSeconds();
        setLock(s);
        setMsg(s > 0 ? `Too many attempts. Try again in ${s}s.` : 'Incorrect PIN');
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <H>Enter PIN</H>
      <Text style={{ color: C.text, fontSize: 32, letterSpacing: 8, minHeight: 44 }}>{'•'.repeat(pin.length)}</Text>
      <T color={C.crimson} small>{lock > 0 ? `Locked for ${lock}s` : msg}</T>
      <View style={{ width: 270, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<'].map((k) => (
          <Pressable key={k} accessibilityLabel={k === '<' ? 'Delete' : k === 'C' ? 'Clear' : k} onPress={() => (k === 'C' ? setPin('') : k === '<' ? setPin(pin.slice(0, -1)) : void press(k))} style={{ width: 80, height: 64, borderRadius: 14, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontSize: 24 }}>{k === '<' ? '⌫' : k}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
