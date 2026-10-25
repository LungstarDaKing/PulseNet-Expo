import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Card, H, Notice, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { FIRST_AID } from '../data/firstAid';
import { dialEmergencyNumber } from '../services/sos';
import { award } from '../services/safePoints';
import { Btn } from '../components/ui';

export default function FirstAid() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Screen>
      <Notice kind="warn">In any serious emergency call 10177 or 112 first. This is a quick reference, not training.</Notice>
      {FIRST_AID.map((t) => {
        const isOpen = open === t.id;
        return (
          <Card key={t.id} accent={t.urgent ? C.crimson : C.teal}>
            <Pressable onPress={() => { setOpen(isOpen ? null : t.id); if (!isOpen) void award('first_aid_read', t.id); }} accessibilityRole="button">
              <H>{t.title}</H>
              <T dim small>{t.titleAf} · tap to {isOpen ? 'close' : 'open'}</T>
            </Pressable>
            {isOpen && (
              <>
                {t.steps.map((s, i) => <T key={i}>{i + 1}. {s}</T>)}
                <T bold color={C.amber}>Do not</T>
                {t.never.map((s, i) => <T key={i} small>• {s}</T>)}
                {t.urgent && <Btn label="Call 10177 (ambulance)" onPress={() => void dialEmergencyNumber('10177')} />}
              </>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
