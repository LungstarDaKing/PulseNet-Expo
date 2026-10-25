import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNow } from '../hooks/useAsync';
import { safetyState } from '../services/safetyState';
import { cancelEmergency } from '../services/sos';

/** Looks like a plain clock. Long-press for 2 seconds to end the silent emergency. */
export default function Stealth() {
  const router = useRouter();
  const now = new Date(useNow(1000));
  const [busy, setBusy] = useState(false);
  const end = async () => {
    if (busy) return;
    setBusy(true);
    await cancelEmergency();
    safetyState.setGreen();
    router.replace('/');
  };
  return (
    <Pressable delayLongPress={2000} onLongPress={() => void end()} style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <View>
        <Text style={{ color: '#ddd', fontSize: 72, fontWeight: '200' }}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        <Text style={{ color: '#666', textAlign: 'center' }}>{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      </View>
    </Pressable>
  );
}
