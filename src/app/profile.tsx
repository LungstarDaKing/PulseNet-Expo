import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { Btn, Card, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { nativeAvailable } from '../lib/native';
import { secureGetJSON, secureSetJSON, wipeAllData } from '../lib/storage';
import { distressSupported, isDistressEnabled, setDistressEnabled } from '../services/distress';
import { award } from '../services/safePoints';
import { clearAppLock, clearDuressPin, getAppLockEnabled, hasDuressPin, isValidPinFormat, setAppLockPin, setDuressPin } from '../services/pinLock';
import { getLocationSharing, getSettings, getUserName, setLocationSharing, setUserName, updateSettings } from '../services/settings';

interface Medical { bloodType: string; allergies: string; conditions: string; medications: string; notes: string }
const EMPTY: Medical = { bloodType: '', allergies: '', conditions: '', medications: '', notes: '' };

export default function Profile() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [med, setMed] = useState<Medical>(EMPTY);
  const [share, setShare] = useState(true);
  const [lock, setLock] = useState(false);
  const [duress, setDuress] = useState(false);
  const [drill, setDrill] = useState(false);
  const [auto, setAuto] = useState(false);
  const [voice, setVoice] = useState(isDistressEnabled());
  const [pin, setPin] = useState('');
  const [dpin, setDpin] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setName(await getUserName());
    setMed({ ...EMPTY, ...(await secureGetJSON<Partial<Medical>>('medical_profile', {})) });
    setShare(await getLocationSharing());
    setLock(await getAppLockEnabled());
    setDuress(await hasDuressPin());
    const s = await getSettings();
    setDrill(s.drillMode); setAuto(s.vitalsAutoAlert);
  };
  useEffect(() => { void load(); }, []);

  const saveProfile = async () => {
    await setUserName(name);
    await secureSetJSON('medical_profile', med);
    if (Object.values(med).some((v) => v.trim())) void award('profile_saved');
    setMsg('Profile saved');
  };
  const savePin = async () => {
    if (!isValidPinFormat(pin)) { setMsg('PIN must be 4 to 8 digits'); return; }
    await setAppLockPin(pin); setPin(''); setLock(true); void award('pin_set'); setMsg('App lock is on');
  };
  const saveDuress = async () => {
    try { await setDuressPin(dpin); setDpin(''); setDuress(true); void award('duress_set'); setMsg('Duress PIN set'); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <Screen>
      <H>You</H>
      <Card>
        <Field label="Your name (used in alerts)" value={name} onChangeText={setName} />
        <Field label="Blood type" value={med.bloodType} onChangeText={(v) => setMed({ ...med, bloodType: v })} />
        <Field label="Allergies" value={med.allergies} onChangeText={(v) => setMed({ ...med, allergies: v })} />
        <Field label="Conditions" value={med.conditions} onChangeText={(v) => setMed({ ...med, conditions: v })} />
        <Field label="Medications" value={med.medications} onChangeText={(v) => setMed({ ...med, medications: v })} />
        <Field label="Notes for responders" value={med.notes} onChangeText={(v) => setMed({ ...med, notes: v })} multiline />
        <Btn label="Save profile" onPress={() => void saveProfile()} />
        {msg ? <Notice kind="info">{msg}</Notice> : null}
      </Card>

      <Card>
        <Row><T bold style={{ flex: 1 }}>Include my location in alerts</T><Switch value={share} onValueChange={(v) => { setShare(v); void setLocationSharing(v); }} trackColor={{ true: C.teal }} /></Row>
        <Row><T bold style={{ flex: 1 }}>SOS drill mode (sends nothing)</T><Switch value={drill} onValueChange={(v) => { setDrill(v); void updateSettings({ drillMode: v }); }} trackColor={{ true: C.amber }} /></Row>
        {distressSupported() && <Row><View style={{ flex: 1 }}><T bold>Voice distress listener</T><T dim small>4 quick taps, then say "help me". Off by default so normal taps never start the microphone.</T></View><Switch value={voice} onValueChange={(v) => void setDistressEnabled(v).then(setVoice)} trackColor={{ true: C.amber }} /></Row>}
        <Row><T bold style={{ flex: 1 }}>Auto-text contacts on critical heart rate</T><Switch value={auto} onValueChange={(v) => { setAuto(v); void updateSettings({ vitalsAutoAlert: v }); }} trackColor={{ true: C.amber }} /></Row>
      </Card>

      <Card>
        <T bold>App lock {lock ? '(on)' : '(off)'}</T>
        <Field label="New PIN (4 to 8 digits)" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} />
        <Btn label={lock ? 'Change PIN' : 'Turn on app lock'} onPress={() => void savePin()} />
        {lock && (
          <>
            <T dim small>Duress PIN: unlocks normally but silently alerts your contacts. {duress ? 'Set.' : 'Not set.'}</T>
            <Field label="Duress PIN (different from your PIN)" value={dpin} onChangeText={setDpin} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <Btn outline label="Save duress PIN" onPress={() => void saveDuress()} />
            {duress && <Btn outline color={C.amber} label="Remove duress PIN" onPress={() => void clearDuressPin().then(() => setDuress(false))} />}
            <Btn outline color={C.crimson} label="Turn off app lock" onPress={() => void clearAppLock().then(() => setLock(false))} />
          </>
        )}
      </Card>

      <Card>
        <T bold>This build</T>
        <T dim small>Silent SMS and direct calling: {nativeAvailable ? 'available (native module loaded)' : 'NOT available here. Alerts open your messaging app instead. Use the APK build for silent sending.'}</T>
        <T dim small>Voice distress listener: {distressSupported() ? 'available' : 'needs a development build'}</T>
      </Card>

      <Btn outline label="Audit log" color={C.textDim} onPress={() => router.push('/audit')} />
      <Btn outline color={C.crimson} label="Forget me: erase all data" onPress={() => Alert.alert('Erase everything?', 'Contacts, medical details, PIN, history and settings will be deleted from this phone.', [{ text: 'Cancel' }, { text: 'Erase', style: 'destructive', onPress: () => void import('../services/auth').then((m) => m.signOutLocal()).catch(() => undefined).then(() => wipeAllData()).then(() => Alert.alert('Erased', 'Close and reopen PulseNet.')) }])} />
    </Screen>
  );
}
