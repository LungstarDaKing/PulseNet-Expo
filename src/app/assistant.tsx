import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CallRow } from '../components/CallRow';
import { Btn, Notice, T } from '../components/ui';
import { C, R } from '../constants/theme';
import { FIRST_AID } from '../data/firstAid';
import { firstAidTopicFor, looksUrgent } from '../services/alertsLogic';
import { PULSE_MESSAGES, PulseError, askPulse } from '../services/pulse';
import { classifyIncident } from '../services/incidents';

interface Msg { role: 'user' | 'assistant' | 'system'; text: string; urgent?: boolean; topic?: string }

const PROMPTS = ['Someone is following me', 'I smell gas in my house', 'How do I treat a burn?', 'What should I do after a car accident?'];

export default function Assistant() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const urgent = looksUrgent(text) || ['high', 'critical'].includes(classifyIncident(text).severity);
    const topic = firstAidTopicFor(text) ?? undefined;
    const history = [...msgs, { role: 'user' as const, text, urgent, topic }];
    setMsgs(history);
    setInput('');
    setBusy(true);
    try {
      const turns = history.filter((m) => m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
      const r = await askPulse(turns);
      setMsgs([...history, { role: 'assistant', text: r.reply, urgent: r.emergency }]);
    } catch (e) {
      const code = e instanceof PulseError ? e.code : 'unavailable';
      setMsgs([...history, { role: 'system', text: `${PULSE_MESSAGES[code]} ${topic ? 'Written first-aid steps are shown below.' : urgent ? 'Use the call buttons above if you are in danger.' : ''}`.trim(), topic }]);
    }
    setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  };

  const showCalls = msgs.some((m) => m.urgent);
  const topic = (id?: string) => FIRST_AID.find((t) => t.id === id);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scroll as never} contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Notice kind="warn">Pulse is an AI assistant. It can be wrong. It cannot call anyone, send your location or replace the police, an ambulance or a doctor. In danger, call 10111, 10177 or 112.</Notice>
          {showCalls && <CallRow />}
          {msgs.length === 0 && (
            <View style={{ gap: 8 }}>
              <T dim>Ask about safety, what to do in a situation, or first aid.</T>
              {PROMPTS.map((p) => <Pressable key={p} onPress={() => void send(p)} style={{ backgroundColor: C.surface, borderRadius: R.md, padding: 12, borderWidth: 1, borderColor: C.border }}><Text style={{ color: C.text }}>{p}</Text></Pressable>)}
            </View>
          )}
          {msgs.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 6 }}>
              <View style={{ backgroundColor: m.role === 'user' ? C.brand : m.role === 'system' ? C.surfaceHigh : C.surface, borderRadius: 16, padding: 12, borderWidth: m.role === 'assistant' ? 1 : 0, borderColor: C.border }}>
                <Text style={{ color: m.role === 'user' ? '#04231A' : m.role === 'system' ? C.amber : C.text, lineHeight: 20 }}>{m.text}</Text>
              </View>
              {m.role === 'assistant' && <Text style={{ color: C.textDim, fontSize: 11 }}>AI-generated. Check important details.</Text>}
              {(m.role === 'system' || m.role === 'user') && topic(m.topic) && m.role === 'system' && (
                <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: C.ok }}>
                  <T bold>{topic(m.topic)!.title}</T>
                  {topic(m.topic)!.steps.slice(0, 4).map((s, k) => <T key={k} small>{k + 1}. {s}</T>)}
                  <Btn small outline label="Open full first-aid guide" onPress={() => router.push('/first-aid')} />
                </View>
              )}
            </View>
          ))}
          {busy && <T dim small>Pulse is thinking…</T>}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <TextInput value={input} onChangeText={setInput} placeholder="Type a message…" placeholderTextColor={C.textDim} maxLength={2000} multiline style={{ flex: 1, backgroundColor: C.surface, color: C.text, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 110 }} />
          <Pressable accessibilityLabel="Send" onPress={() => void send(input)} disabled={busy || !input.trim()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.5 : 1 }}>
            <Text style={{ fontSize: 18 }}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
