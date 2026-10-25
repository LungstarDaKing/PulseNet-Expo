import React, { useState } from 'react';
import { Btn, Card, Field, H, Notice, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { SafetyProfile, deleteProfile, getActiveProfile, getAllProfiles, saveProfile, setActiveProfile } from '../services/safetyProfiles';

export default function Profiles() {
  const all = useAsync(getAllProfiles, [] as SafetyProfile[]);
  const active = useAsync(getActiveProfile, null as SafetyProfile | null);
  const [f, setF] = useState({ name: '', followUp: '3', checkIn: '30', missed: '2', dev: '100' });
  const [err, setErr] = useState('');
  const reload = async () => { await all.reload(); await active.reload(); };

  const create = async () => {
    try {
      await saveProfile({ name: f.name, description: 'Custom profile', followUpMinutes: +f.followUp, checkInMinutes: +f.checkIn, maxMissedCheckIns: +f.missed, deviationWarnMeters: +f.dev });
      setF({ ...f, name: '' }); setErr(''); await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invalid'); }
  };

  return (
    <Screen>
      <Notice kind="info">The active profile sets how often SOS sends location updates and how companion walks check in and escalate.</Notice>
      {all.data.map((p) => (
        <Card key={p.id} accent={active.data?.id === p.id ? C.ok : C.border}>
          <T bold>{p.name}{active.data?.id === p.id ? ' (active)' : ''}</T>
          <T dim small>{p.description}</T>
          <T dim small>SOS updates every {p.followUpMinutes} min · check-in every {p.checkInMinutes} min · escalate after {p.maxMissedCheckIns} missed · route warning at {p.deviationWarnMeters} m</T>
          {active.data?.id !== p.id && <Btn small label="Use this profile" onPress={() => void setActiveProfile(p.id).then(reload)} />}
          {!p.builtIn && <Btn small outline color={C.crimson} label="Delete" onPress={() => void deleteProfile(p.id).then(reload)} />}
        </Card>
      ))}
      <Card>
        <H>New profile</H>
        <Field label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Field label="SOS location update every (min, 1-60)" value={f.followUp} onChangeText={(v) => setF({ ...f, followUp: v })} keyboardType="number-pad" />
        <Field label="Check-in every (min, 5-180)" value={f.checkIn} onChangeText={(v) => setF({ ...f, checkIn: v })} keyboardType="number-pad" />
        <Field label="Missed check-ins before alert (1-5)" value={f.missed} onChangeText={(v) => setF({ ...f, missed: v })} keyboardType="number-pad" />
        <Field label="Route warning distance (m, 25-1000)" value={f.dev} onChangeText={(v) => setF({ ...f, dev: v })} keyboardType="number-pad" />
        {err ? <Notice kind="error">{err}</Notice> : null}
        <Btn label="Save profile" onPress={() => void create()} />
      </Card>
    </Screen>
  );
}
