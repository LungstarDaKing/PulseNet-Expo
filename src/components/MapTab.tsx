import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../constants/theme';
import { LatLng } from '../lib/geo';
import { getPosition } from '../lib/location';
import { activeOnly, typeInfo } from '../services/alertsLogic';
import { feed, useFeed } from '../services/alertsStore';
import { NearbyHelp, fetchNearbyHelp } from '../services/safePlaces';
import { Btn, Notice, T } from './ui';
import { MapPoint, buildMapHtml } from '../lib/mapHtml';

export function MapTab() {
  const f = useFeed();
  const [me, setMe] = useState<LatLng | null>(null);
  const [help, setHelp] = useState<NearbyHelp[]>([]);
  const [err, setErr] = useState('');
  const [showHelp, setShowHelp] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    void (async () => {
      setErr('');
      const p = await getPosition();
      if (!p) { setErr('Location unavailable. Turn on location to see the map.'); return; }
      setMe(p);
      void feed.refresh();
      try { setHelp((await fetchNearbyHelp(p, 3000)).items.slice(0, 40)); } catch { /* map still works without help places */ }
    })();
  }, [nonce]);

  const html = useMemo(() => {
    if (!me) return '';
    const pts: MapPoint[] = [{ lat: me.latitude, lon: me.longitude, title: 'You are here', detail: 'Approximate position', color: C.sky, kind: 'me' }];
    f.alerts.filter(activeOnly).forEach((a) => pts.push({ lat: a.latitude, lon: a.longitude, title: `${typeInfo(a.type).label} (${a.severity})`, detail: `${a.verified ? 'Verified' : 'Unverified report'}: ${a.description.slice(0, 140)}`, color: a.severity === 'critical' || a.severity === 'high' ? C.crimson : C.amber, kind: 'alert' }));
    if (showHelp) help.forEach((h) => pts.push({ lat: h.latitude, lon: h.longitude, title: h.name, detail: 'OpenStreetMap listing: may be out of date', color: C.ok, kind: 'help' }));
    return buildMapHtml(me, pts);
  }, [me, f.alerts, help, showHelp]);

  if (err) return <View style={{ padding: 16, gap: 12 }}><Notice kind="warn">{err}</Notice><Btn label="Try again" onPress={() => setNonce(nonce + 1)} /></View>;
  if (!me) return <View style={{ padding: 16 }}><T dim>Finding your location…</T></View>;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 10, padding: 10, alignItems: 'center', backgroundColor: C.surface }}>
        <T small dim style={{ flex: 1 }}>Red/amber: community reports (fuzzed ~110 m). Green: help places from OpenStreetMap.</T>
        <Btn small outline label={showHelp ? 'Hide help' : 'Show help'} onPress={() => setShowHelp(!showHelp)} />
      </View>
      <WebView
        key={html.length}
        originWhitelist={['about:blank', 'https://*']}
        source={{ html, baseUrl: 'https://pulsenet.local' }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('https://pulsenet.local')}
        style={{ flex: 1, backgroundColor: C.bg }}
      />
    </View>
  );
}
