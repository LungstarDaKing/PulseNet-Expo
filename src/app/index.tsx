import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertsTab } from '../components/AlertsTab';
import { HomeTab } from '../components/HomeTab';
import { MapTab } from '../components/MapTab';
import { ProfileTab } from '../components/ProfileTab';
import { TabBar, TabId } from '../components/tabs';
import { C } from '../constants/theme';
import { activeOnly, sevRank } from '../services/alertsLogic';
import { feed, useFeed } from '../services/alertsStore';

/** Home, Map, Alerts and Profile. Tools open as normal screens on top. */
export default function TabsHost() {
  const [tab, setTab] = useState<TabId>('home');
  const f = useFeed();
  useEffect(() => { void feed.refresh(); }, []);
  const urgent = f.alerts.filter((a) => activeOnly(a) && sevRank(a.severity) >= sevRank('high')).length;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeTab goAlerts={() => setTab('alerts')} goProfile={() => setTab('profile')} />}
        {tab === 'map' && <MapTab />}
        {tab === 'alerts' && <AlertsTab />}
        {tab === 'profile' && <ProfileTab />}
      </View>
      <TabBar active={tab} onChange={setTab} badge={urgent} />
    </SafeAreaView>
  );
}
