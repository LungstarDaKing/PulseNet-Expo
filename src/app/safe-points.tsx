import React from 'react';
import { View } from 'react-native';
import { Card, H, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { BADGES, EVENTS, State, dailyChallenges, getState, levelFor } from '../services/safePoints';

export default function SafePoints() {
  const { data: s } = useAsync<State | null>(getState, null);
  if (!s) return <Screen><T dim>Loading…</T></Screen>;
  const lv = levelFor(s.points);
  const today = s.daily.counts;
  return (
    <Screen>
      <Card accent={C.amber}>
        <H>{lv.name} · level {lv.level}</H>
        <T>{s.points} points{lv.next ? ` · ${lv.toNext} to ${lv.next.name}` : ''}</T>
        <View style={{ height: 8, backgroundColor: C.surfaceHigh, borderRadius: 4 }}>
          <View style={{ height: 8, width: `${Math.round(lv.progress * 100)}%`, backgroundColor: C.amber, borderRadius: 4 }} />
        </View>
        <T dim small>Streak: {s.streak} day{s.streak === 1 ? '' : 's'} · best {s.bestStreak}</T>
      </Card>
      <H>Today</H>
      {dailyChallenges().map((c) => {
        const n = today[c.event] ?? 0;
        return <Card key={c.id} accent={n >= c.target ? C.ok : C.border}><T>{c.label}</T><T dim small>{Math.min(n, c.target)} / {c.target}</T></Card>;
      })}
      <H>Badges</H>
      {BADGES.map((b) => {
        const have = s.badges.includes(b.id);
        return <Card key={b.id} accent={have ? C.ok : C.border}><T bold color={have ? C.ok : C.textDim}>{b.name}</T><T dim small>{b.description}</T></Card>;
      })}
      <H>How points are earned</H>
      <Card>{Object.values(EVENTS).map((e) => <T key={e.label} small dim>+{e.points} {e.label}{e.once ? ' (once)' : ''}</T>)}</Card>
      <H>Recent</H>
      {s.history.slice(0, 10).map((h, i) => <T key={i} small dim>{new Date(h.at).toLocaleString()} · +{h.points} {EVENTS[h.event].label}</T>)}
    </Screen>
  );
}
