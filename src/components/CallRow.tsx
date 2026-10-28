import React from 'react';
import { View } from 'react-native';
import { C } from '../constants/theme';
import { dialEmergencyNumber } from '../services/sos';
import { Btn } from './ui';

/** The three numbers that matter. Always one tap away on every emergency-related screen. */
export function CallRow() {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Btn small color={C.crimson} label="Police 10111" onPress={() => void dialEmergencyNumber('10111')} /></View>
      <View style={{ flex: 1 }}><Btn small color={C.crimson} label="Ambulance 10177" onPress={() => void dialEmergencyNumber('10177')} /></View>
      <View style={{ flex: 1 }}><Btn small color={C.crimson} label="Any phone 112" onPress={() => void dialEmergencyNumber('112')} /></View>
    </View>
  );
}
