import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Card, Chip, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { TIP_CATEGORIES } from '../data/safetyTips';
import { useAsync } from '../hooks/useAsync';
import { award, getState } from '../services/safePoints';

export default function Tips() {
  const [cat, setCat] = useState(TIP_CATEGORIES[0].id);
  const st = useAsync(getState, null as Awaited<ReturnType<typeof getState>> | null);
  const [read, setRead] = useState<string[]>([]);
  const c = TIP_CATEGORIES.find((x) => x.id === cat)!;
  const seen = (i: number) => read.includes(`${cat}:${i}`) || !!st.data?.seen.includes(`tip_read:${cat}:${i}`);
  const done = c.tips.filter((_, i) => seen(i)).length;
  return (
    <Screen>
      <Row wrap>{TIP_CATEGORIES.map((x) => <Chip key={x.id} label={x.title} active={x.id === cat} onPress={() => setCat(x.id)} />)}</Row>
      <T dim small>{done} of {c.tips.length} read. Tap a tip to mark it read (+1 safe point, once per tip).</T>
      {c.tips.map((tip, i) => (
        <Pressable key={i} onPress={() => { if (!seen(i)) { setRead([...read, `${cat}:${i}`]); void award('tip_read', `${cat}:${i}`); } }}>
          <Card accent={seen(i) ? C.ok : C.border}><T>{tip}</T></Card>
        </Pressable>
      ))}
    </Screen>
  );
}
