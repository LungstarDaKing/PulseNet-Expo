import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/theme';
import { recordCrash } from '../lib/crashLog';
import { Btn, H, Notice, T } from './ui';

/** Shows the real error instead of a blank crash, with a way to copy it. SOS numbers stay one tap away. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; copied: boolean }> {
  state = { error: null as Error | null, copied: false };
  static getDerivedStateFromError(error: Error) { return { error, copied: false }; }
  componentDidCatch(error: Error) { void recordCrash(error, false); }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const text = `${error.message}\n${(error.stack ?? '').split('\n').slice(0, 8).join('\n')}`;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 20, gap: 12 }}>
        <H>Something went wrong</H>
        <Notice kind="warn">PulseNet hit an error on this screen. Your data is safe. If you are in danger, call 10111, 10177 or 112.</Notice>
        <ScrollView style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 12 }}>
          <Text selectable style={{ color: C.text, fontFamily: 'monospace', fontSize: 12 }}>{text}</Text>
        </ScrollView>
        <View style={{ gap: 8 }}>
          <Btn label="Try again" onPress={() => this.setState({ error: null })} />
          <Btn outline label={copied ? 'Copied: paste it to your developer' : 'Copy error details'} onPress={async () => { await Clipboard.setStringAsync(text); this.setState({ copied: true }); }} />
          <T dim small>If this keeps happening, send the copied text.</T>
        </View>
      </SafeAreaView>
    );
  }
}
