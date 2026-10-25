/** Verified South African emergency and GBV helplines (ported from lib/data/sa_helplines.dart).
 * Source noted in the original: DSD GBV Command Centre, SAPS GBV pamphlet, gbvf.org.za. */
export interface Helpline {
  name: string;
  description: string;
  dial: string;
  display: string;
  emergency?: boolean;
}

export const IMMEDIATE_DANGER: Helpline[] = [
  { name: 'Police (SAPS)', description: 'Crime in progress / immediate danger', dial: '10111', display: '10111', emergency: true },
  { name: 'Emergency (any mobile)', description: 'Works without airtime or a SIM on most networks', dial: '112', display: '112', emergency: true },
  { name: 'Ambulance', description: 'Medical emergency', dial: '10177', display: '10177', emergency: true },
];

export const GBV_SUPPORT: Helpline[] = [
  { name: 'GBV Command Centre', description: '24/7 social workers. Free. Referrals to SAPS and shelters', dial: '0800428428', display: '0800 428 428' },
  { name: '"Please Call Me" (free)', description: 'Cannot talk or have no airtime? Dial this and they call you back', dial: '*120*7867#', display: '*120*7867#' },
  { name: 'Stop Gender Violence Helpline', description: 'Counselling and safety planning, all 11 languages', dial: '0800150150', display: '0800 150 150' },
  { name: 'National Shelter Movement', description: 'Find a safe shelter. Also SMS/WhatsApp 082 057 8600', dial: '0800001005', display: '0800 001 005' },
  { name: 'Human Trafficking Hotline', description: '24/7 confidential', dial: '0800222777', display: '0800 222 777' },
];

export const WELLBEING: Helpline[] = [
  { name: 'Lifeline SA', description: 'Emotional support', dial: '0861322322', display: '0861 322 322' },
  { name: 'SADAG Suicide Crisis Line', description: '24/7 mental health crisis', dial: '0800567567', display: '0800 567 567' },
  { name: 'Childline SA', description: 'Children in danger', dial: '116', display: '116' },
];

export const EMERGENCY_NUMBERS = {
  police: '10111',
  ambulance: '10177',
  general: '112',
  gbvCommandCentre: '0800428428',
} as const;
