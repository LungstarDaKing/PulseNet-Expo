import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/theme';
import { Btn, Card, H, Notice, T } from './ui';

const PAGES = [
  { title: 'Help in one press', body: 'Hold SOS and PulseNet texts your emergency contacts your location, then keeps sending updates until you say you are safe.' },
  { title: 'Honest about delivery', body: 'PulseNet only says an alert was sent when your phone actually handed the SMS to the network. It cannot see whether the other phone received it.' },
  { title: 'Private by design', body: 'Contacts, medical details and your PIN stay encrypted on this device. Nothing is uploaded to a PulseNet server.' },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const p = PAGES[i];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', marginTop: 24, gap: 16 }}>
        <Image source={require('../../assets/pulsenet_logo.png')} style={{ width: 120, height: 120 }} resizeMode="contain" />
        <H>{p.title}</H>
        <T dim style={{ textAlign: 'center' }}>{p.body}</T>
      </View>
      <View style={{ gap: 12 }}>
        {i === PAGES.length - 1 && <Notice kind="warn">PulseNet supports your safety but is not a substitute for calling 10111 or 112 when you are in danger.</Notice>}
        <Card><T small dim>Step {i + 1} of {PAGES.length}</T></Card>
        <Btn label={i === PAGES.length - 1 ? 'Get started' : 'Next'} onPress={() => (i === PAGES.length - 1 ? onDone() : setI(i + 1))} />
      </View>
    </SafeAreaView>
  );
}
