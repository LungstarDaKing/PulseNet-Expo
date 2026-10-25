import React from 'react';
import { Btn, Card, H, Notice, Screen, T } from '../components/ui';
import { GBV_SUPPORT, Helpline, IMMEDIATE_DANGER, WELLBEING } from '../constants/helplines';
import { C } from '../constants/theme';
import { dialEmergencyNumber } from '../services/sos';

const Group = ({ title, items }: { title: string; items: Helpline[] }) => (
  <>
    <H>{title}</H>
    {items.map((h) => (
      <Card key={h.name} accent={h.emergency ? C.crimson : C.teal}>
        <T bold>{h.name}</T>
        <T dim small>{h.description}</T>
        <Btn label={`Call ${h.display}`} color={h.emergency ? C.crimson : C.teal} onPress={() => void dialEmergencyNumber(h.dial)} />
      </Card>
    ))}
  </>
);

export default function Helplines() {
  return (
    <Screen>
      <Notice kind="info">South African numbers, checked against DSD, SAPS and gbvf.org.za when compiled. Numbers can change: if one fails, use 112.</Notice>
      <Group title="Immediate danger" items={IMMEDIATE_DANGER} />
      <Group title="Gender-based violence support" items={GBV_SUPPORT} />
      <Group title="Wellbeing" items={WELLBEING} />
    </Screen>
  );
}
