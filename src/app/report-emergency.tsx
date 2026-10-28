import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, Switch, Text, View } from 'react-native';
import { CallRow } from '../components/CallRow';
import { Btn, Card, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { Fix, getPosition } from '../lib/location';
import { cloudConfigured } from '../lib/supabase';
import { ALLOWED_MIME, MAX_EVIDENCE_BYTES, REPORT_TYPES, ReportType, SEVERITIES, Severity, containsPersonalData, suggestedSeverity, validateReportInput } from '../services/alertsLogic';
import { feed } from '../services/alertsStore';
import { useSession } from '../services/auth';
import { CloudError, SubmitOutcome, submitCommunityReport } from '../services/cloud';
import { Analysis, PULSE_MESSAGES, PulseError, analyzeReport } from '../services/pulse';
import { classifyIncident, submitReport as saveLocal } from '../services/incidents';
import { award } from '../services/safePoints';
import { sendMessageToContacts } from '../services/sos';

type Result = { kind: 'sent' | 'queued'; outcome: SubmitOutcome; contacts: number | null } | { kind: 'local'; contacts: number | null };

export default function ReportEmergency() {
  const router = useRouter();
  const { session } = useSession();
  const canSend = cloudConfigured && !!session;
  const [type, setType] = useState<ReportType>('other');
  const [text, setText] = useState('');
  const [sev, setSev] = useState<Severity>('low');
  const [sevTouched, setSevTouched] = useState(false);
  const [sevSource, setSevSource] = useState<'user' | 'rules' | 'ai'>('rules');
  const [pos, setPos] = useState<Fix | null>(null);
  const [share, setShare] = useState(true);
  const [locErr, setLocErr] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; mime: string }[]>([]);
  const [ai, setAi] = useState<Analysis | null>(null);
  const [aiMsg, setAiMsg] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [alsoContacts, setAlsoContacts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const locate = async () => { setLocErr(''); const p = await getPosition(); setPos(p); if (!p) setLocErr('Location unavailable. Turn on location and allow PulseNet to use it.'); };
  useEffect(() => { void locate(); }, []);

  // keep the rule-based suggestion in step with what is typed, until the user picks one
  useEffect(() => {
    if (sevTouched) return;
    setSev(suggestedSeverity(type, text.trim().length >= 10 ? classifyIncident(text).severity : 'low'));
    setSevSource('rules');
  }, [type, text, sevTouched]);

  const addPhotos = async (camera: boolean) => {
    if (photos.length >= 3) return;
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', `Allow ${camera ? 'camera' : 'photo'} access to attach evidence.`); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: 3 - photos.length });
    if (r.canceled) return;
    const next = [...photos];
    for (const a of r.assets) {
      const mime = a.mimeType ?? 'image/jpeg';
      if (!ALLOWED_MIME.includes(mime)) { Alert.alert('Unsupported file', 'Only JPEG, PNG or WebP photos can be attached.'); continue; }
      if (a.fileSize && a.fileSize > MAX_EVIDENCE_BYTES) { Alert.alert('Too large', 'Each photo must be under 5 MB.'); continue; }
      if (next.length < 3) next.push({ uri: a.uri, mime });
    }
    setPhotos(next);
  };

  const analyse = async () => {
    setAiBusy(true); setAiMsg(''); setAi(null);
    try { setAi(await analyzeReport(text, type)); }
    catch (e) { setAiMsg(e instanceof PulseError ? PULSE_MESSAGES[e.code] : PULSE_MESSAGES.unavailable); }
    setAiBusy(false);
  };
  const useAi = () => { if (!ai) return; setType(ai.type); setSev(ai.severity); setSevTouched(true); setSevSource('ai'); };

  const send = async () => {
    const body = { description: text, latitude: pos?.latitude ?? NaN, longitude: pos?.longitude ?? NaN, evidence: photos };
    const invalid = validateReportInput(body);
    if (invalid && !(invalid.startsWith('Your location') && !share)) { Alert.alert('Check your report', invalid); return; }
    setBusy(true);
    try {
      let contacts: number | null = null;
      if (alsoContacts) contacts = await sendMessageToContacts(`I am reporting a ${type} incident near me: ${text.trim().slice(0, 120)}`, { allowComposer: true });
      if (canSend && share && pos) {
        const out = await submitCommunityReport({ type, description: text, latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy, severity: sev, severitySource: sevSource, aiSummary: sevSource === 'ai' ? ai?.summary ?? null : null, evidence: photos });
        feed.markOwn(out.id);
        void award('report_made');
        setResult({ kind: out.status, outcome: out, contacts });
        void feed.refresh();
      } else {
        const at = pos ?? { latitude: 0, longitude: 0 };
        const override = type === 'fire' ? 'environmentalHazard' : type === 'crime' ? 'crime' : type === 'accident' ? 'trafficAccident' : undefined;
        await saveLocal(text, at, { type: override, severity: sev }, true);
        void award('report_made');
        setResult({ kind: 'local', contacts });
      }
    } catch (e) {
      Alert.alert('Not sent', e instanceof CloudError || e instanceof Error ? e.message : 'Try again.');
    }
    setBusy(false);
  };

  if (result) {
    return (
      <Screen>
        {result.kind === 'sent' && <Notice kind="ok">Report sent to PulseNet. Signed-in people near you can now see it as an UNVERIFIED community report.{result.outcome.evidenceFailed ? ` ${result.outcome.evidenceFailed} photo(s) failed to upload.` : ''}</Notice>}
        {result.kind === 'queued' && <Notice kind="warn">No connection, so this report is saved on your phone and has NOT been sent. PulseNet retries when you reopen the app or refresh Alerts. Photos are kept only until it sends.</Notice>}
        {result.kind === 'local' && <Notice kind="info">Saved on this phone only. Nobody else can see it.{!canSend ? ' Sign in to share reports with people nearby.' : !share ? ' Location sharing was off.' : ''}</Notice>}
        {result.contacts != null && <Notice kind={result.contacts > 0 ? 'ok' : 'warn'}>{result.contacts > 0 ? `Message handed to ${result.contacts} emergency contact(s). Delivery is not confirmed.` : 'Your contacts could not be messaged.'}</Notice>}
        <Notice kind="error">This did NOT contact the police, an ambulance or the fire service. If anyone is in danger, call now.</Notice>
        <CallRow />
        <Btn label="Done" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Notice kind="error">In immediate danger? Call first. This report does NOT alert emergency services.</Notice>
      <CallRow />
      <H>What is happening?</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {REPORT_TYPES.map((t) => {
          const on = t.id === type;
          return (
            <Pressable key={t.id} onPress={() => setType(t.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ width: '31%', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 2, borderColor: on ? t.color : C.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.color, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={t.icon as never} size={22} color="#fff" /></View>
              <Text style={{ color: C.text, fontSize: 13 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Describe it: what, and where exactly?" value={text} onChangeText={setText} multiline maxLength={1000} />
      {containsPersonalData(text) && <Notice kind="warn">Your description is shown to people nearby. Remove phone numbers and ID numbers.</Notice>}

      <Card>
        <Row><Ionicons name="location" size={18} color={C.brand} /><T bold style={{ flex: 1 }}>{pos ? `Location found (accuracy about ${Math.round(pos.accuracy ?? 0)} m)` : 'Finding your location…'}</T></Row>
        {locErr ? <Notice kind="warn">{locErr}</Notice> : null}
        <Row><T small dim style={{ flex: 1 }}>Share my location with this report. People see it rounded to about 110 m, and never your name.</T><Switch value={share} onValueChange={setShare} trackColor={{ true: C.brand }} /></Row>
        {!pos && <Btn small outline label="Try again" onPress={() => void locate()} />}
      </Card>

      <T bold>Severity</T>
      <Row wrap>{SEVERITIES.map((s) => <Btn key={s} small outline={s !== sev} color={s === 'critical' || s === 'high' ? C.crimson : s === 'medium' ? C.amber : C.sky} label={s} onPress={() => { setSev(s); setSevTouched(true); setSevSource('user'); }} />)}</Row>
      <T dim small>Suggested from your words{sevSource === 'ai' ? ' by Pulse AI' : ' by simple keyword rules'}. You can change it. High and critical reports can notify people nearby.</T>

      {canSend && (
        <Card>
          <T bold>Pulse AI check (optional)</T>
          <T dim small>Sends your description to PulseNet's AI service for a severity suggestion and short summary. It can be wrong and does not contact anyone.</T>
          <Btn small outline label="Analyse with Pulse AI" busy={aiBusy} disabled={text.trim().length < 10} onPress={() => void analyse()} />
          {aiMsg ? <Notice kind="info">{aiMsg}</Notice> : null}
          {ai && (
            <View style={{ gap: 4 }}>
              <T small color={C.amber}>AI-generated: check it before using.</T>
              <T>Suggested: {ai.type}, {ai.severity}</T>
              <T dim small>{ai.summary}</T>
              {ai.advice.map((a, i) => <T key={i} small>• {a}</T>)}
              <Btn small label="Use this type and severity" onPress={useAi} />
            </View>
          )}
        </Card>
      )}

      <T bold>Photos (optional, up to 3)</T>
      <Row wrap>
        {photos.map((p) => (
          <Pressable key={p.uri} onPress={() => setPhotos(photos.filter((x) => x.uri !== p.uri))} accessibilityLabel="Remove photo">
            <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 10 }} />
          </Pressable>
        ))}
      </Row>
      <Row><Btn small outline label="Take photo" disabled={photos.length >= 3} onPress={() => void addPhotos(true)} /><Btn small outline label="Choose photos" disabled={photos.length >= 3} onPress={() => void addPhotos(false)} /></Row>
      {photos.length > 0 && <T dim small>Photos are private: only you and PulseNet moderators can open them. Tap a photo to remove it. Do not photograph anyone if it is unsafe.</T>}

      <Row><T small dim style={{ flex: 1 }}>Also text my emergency contacts</T><Switch value={alsoContacts} onValueChange={setAlsoContacts} trackColor={{ true: C.brand }} /></Row>
      {!canSend && <Notice kind="info">{cloudConfigured ? 'You are not signed in, so this report will be saved on your phone only.' : 'Community sharing is not connected in this build, so this report will be saved on your phone only.'}</Notice>}
      <Btn label={canSend && share ? 'Send report' : 'Save on this phone'} busy={busy} onPress={() => void send()} />
      {!canSend && cloudConfigured && <Btn outline label="Sign in to share with people nearby" onPress={() => router.push('/auth')} />}
    </Screen>
  );
}
