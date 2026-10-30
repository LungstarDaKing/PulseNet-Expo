import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LockScreen } from '../components/LockScreen';
import { Onboarding, OnboardingChoice } from '../components/Onboarding';
import { C } from '../constants/theme';
import { setSecureScreen } from '../lib/native';
import { initNotifications } from '../lib/notify';
import { K, getBool, setBool } from '../lib/storage';
import { installCrashRecorder } from '../lib/crashLog';
import { handleTap, initDistress } from '../services/distress';
import { getAppLockEnabled, setDuressHandler } from '../services/pinLock';
import { restoreCompanion, restoreWalk } from '../services/walk';
import { safetyState } from '../services/safetyState';
import { dispatchSos, isEmergencyActive } from '../services/sos';
import { restoreRide } from '../services/taxi';
import { award } from '../services/safePoints';

installCrashRecorder();

type Phase = 'loading' | 'onboarding' | 'locked' | 'ready';

export default function Root() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [after, setAfter] = useState<OnboardingChoice | null>(null);
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      setSecureScreen(false); // screenshots and screen recording allowed
      await initNotifications();
      // Duress PIN: looks like a normal unlock but silently alerts contacts.
      setDuressHandler(() => {
        safetyState.setRed(true);
        void dispatchSos({ emergencyType: 'duress PIN', silent: true });
      });
      await safetyState.load();
      await initDistress();
      const seen = await getBool(K.onboarded);
      const lock = await getAppLockEnabled();
      void restoreWalk();
      void restoreCompanion();
      void restoreRide();
      void award('daily_open');
      setPhase(!seen ? 'onboarding' : lock ? 'locked' : 'ready');
    })();
  }, []);

  // Re-lock when backgrounded, unless an emergency is active: never put a PIN between a person in danger and the safety buttons.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'background') return;
      if (isEmergencyActive() || safetyState.getSnapshot().isEmergencyActive) return;
      if (await getAppLockEnabled()) setPhase((p) => (p === 'ready' ? 'locked' : p));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const id = response?.notification.request.identifier;
    if (phase !== 'ready' || !response || handled.current === id) return;
    handled.current = id ?? null;
    const data = response.notification.request.content.data as { fakeCall?: boolean; alertId?: string } | undefined;
    if (data?.fakeCall) router.push('/fake-call-live');
    else if (data?.alertId) router.push({ pathname: '/alert-detail', params: { id: data.alertId } });
  }, [response, phase, router]);

  const onboarded = useCallback(async (choice: OnboardingChoice) => {
    await setBool(K.onboarded, true);
    setAfter(choice);
    setPhase('ready');
  }, []);

  // after onboarding, open the account screen once the navigator exists
  useEffect(() => {
    if (phase !== 'ready' || !after || after === 'skip') return;
    // not cleared on cleanup: setAfter(null) below re-runs this effect, which would cancel the redirect
    setTimeout(() => router.push({ pathname: '/auth', params: { mode: after } }), 50);
    setAfter(null);
  }, [phase, after, router]);

  if (phase === 'loading') return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.crimson} size="large" /></View>;
  if (phase === 'onboarding') return <SafeAreaProvider><StatusBar style="light" /><Onboarding onDone={onboarded} /></SafeAreaProvider>;
  if (phase === 'locked') return <SafeAreaProvider><StatusBar style="light" /><LockScreen onUnlock={() => setPhase('ready')} /></SafeAreaProvider>;

  return (
    // 4 quick taps anywhere arm the distress listener; onTouchStart never steals taps from buttons
    <View style={{ flex: 1 }} onTouchStart={() => handleTap()}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ErrorBoundary>
        <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, headerTitleAlign: 'center', contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ title: 'Account' }} />
          <Stack.Screen name="report-emergency" options={{ title: 'Report Emergency' }} />
          <Stack.Screen name="assistant" options={{ title: 'Pulse AI Assistant' }} />
          <Stack.Screen name="my-reports" options={{ title: 'My reports' }} />
          <Stack.Screen name="alert-detail" options={{ title: 'Alert' }} />
          <Stack.Screen name="sos" options={{ title: 'Emergency SOS', gestureEnabled: false }} />
          <Stack.Screen name="stealth" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="fake-call-live" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="contacts" options={{ title: 'Emergency contacts' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile and settings' }} />
          <Stack.Screen name="first-aid" options={{ title: 'First aid' }} />
          <Stack.Screen name="safety-tips" options={{ title: 'Safety tips' }} />
          <Stack.Screen name="helplines" options={{ title: 'Emergency resources' }} />
          <Stack.Screen name="safe-places" options={{ title: 'Safe places' }} />
          <Stack.Screen name="safe-points" options={{ title: 'Safe points' }} />
          <Stack.Screen name="taxi" options={{ title: 'Taxi and ride safety' }} />
          <Stack.Screen name="walk" options={{ title: 'Walk With Me' }} />
          <Stack.Screen name="companion" options={{ title: 'Companion walk' }} />
          <Stack.Screen name="check-on" options={{ title: 'Check on someone' }} />
          <Stack.Screen name="fake-call" options={{ title: 'Fake call and exit' }} />
          <Stack.Screen name="danger" options={{ title: 'Danger around me' }} />
          <Stack.Screen name="report" options={{ title: 'Report a hazard' }} />
          <Stack.Screen name="vitals" options={{ title: 'Vitals' }} />
          <Stack.Screen name="profiles" options={{ title: 'Safety profiles' }} />
          <Stack.Screen name="audit" options={{ title: 'Audit log' }} />
          <Stack.Screen name="cloud-status" options={{ title: 'Backend connection' }} />
        </Stack>
        </ErrorBoundary>
      </SafeAreaProvider>
    </View>
  );
}
