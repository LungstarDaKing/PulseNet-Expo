import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/theme';
import { cloudConfigured } from '../lib/supabase';
import { Btn, Card, H, Notice, T } from './ui';

export type OnboardingChoice = 'signup' | 'signin' | 'skip';

const PAGES = [
  { title: 'Report. Detect. Respond.', body: 'Hold SOS and PulseNet texts your emergency contacts your location. Report incidents so people nearby can be warned.' },
  { title: 'Honest about delivery', body: 'PulseNet only says an alert was sent when your phone actually handed the SMS to the network. A community report is not a call to the police, ambulance or fire service.' },
  { title: 'Private by design', body: 'Contacts, medical details and your PIN stay encrypted on this phone. Community reports show only an approximate location and never your name.' },
];

export function Onboarding({ onDone }: { onDone: (c: OnboardingChoice) => void }) {
  const [i, setI] = useState(0);
  const p = PAGES[i];
  const last = i === PAGES.length - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', marginTop: 24, gap: 16 }}>
        <Image source={require('../../assets/pulsenet_logo.png')} style={{ width: 120, height: 120 }} resizeMode="contain" />
        <H>{p.title}</H>
        <T dim style={{ textAlign: 'center' }}>{p.body}</T>
      </View>
      <View style={{ gap: 12 }}>
        {last && <Notice kind="warn">PulseNet supports your safety but is not a substitute for calling 10111, 10177 or 112 when you are in danger.</Notice>}
        <Card><T small dim>Step {i + 1} of {PAGES.length}</T></Card>
        {!last ? <Btn label="Next" onPress={() => setI(i + 1)} /> : (
          <>
            {cloudConfigured ? (
              <>
                <Btn label="Get started" onPress={() => onDone('signup')} />
                <Btn outline label="I already have an account" onPress={() => onDone('signin')} />
                <Btn small outline color={C.textDim} label="Continue without an account" onPress={() => onDone('skip')} />
                <T dim small style={{ textAlign: 'center' }}>SOS and your safety tools never need an account.</T>
              </>
            ) : (
              <Btn label="Get started" onPress={() => onDone('skip')} />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
