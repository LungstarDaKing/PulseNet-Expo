import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { DEFAULT, FakeCallConfig, getConfig } from '../services/fakeCall';

/** Full-screen incoming call. Vibrates like a ring; answering starts a call timer that ends itself. */
export default function FakeCallLive() {
  useKeepAwake();
  const router = useRouter();
  const [c, setC] = useState<FakeCallConfig>(DEFAULT);
  const [answered, setAnswered] = useState(false);
  const [secs, setSecs] = useState(0);
  const ended = useRef(false);

  useEffect(() => { void getConfig().then(setC); }, []);
  useEffect(() => {
    if (answered) return;
    Vibration.vibrate([0, 900, 700], true);
    return () => Vibration.cancel();
  }, [answered]);
  useEffect(() => {
    if (!answered) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [answered]);
  useEffect(() => {
    if (answered && secs >= c.durationSeconds) end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs]);

  const end = () => {
    if (ended.current) return;
    ended.current = true;
    Vibration.cancel();
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ color: '#aaa' }}>{answered ? 'Call in progress' : 'Incoming call'}</Text>
        <Text style={{ color: '#fff', fontSize: 36, fontWeight: '300' }}>{c.callerName}</Text>
        <Text style={{ color: '#aaa' }}>{c.callerNumber || 'Mobile'}</Text>
        {answered && <Text style={{ color: '#fff', marginTop: 16, fontSize: 20 }}>{mm}</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 70 }}>
        <Pressable accessibilityLabel="Decline" onPress={end} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 28 }}>✕</Text></Pressable>
        {!answered && <Pressable accessibilityLabel="Answer" onPress={() => setAnswered(true)} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#43A047', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 28 }}>✆</Text></Pressable>}
      </View>
    </SafeAreaView>
  );
}
