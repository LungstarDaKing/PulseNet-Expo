/**
 * First-aid guidance. The original app shipped only ten topic titles (no steps). These steps follow
 * widely published first-aid guidance (Red Cross / St John style). They are a quick reference, not a
 * substitute for training or a clinician. South Africa: ambulance 10177, any mobile 112.
 */
export interface FirstAidTopic {
  id: string;
  title: string;
  titleAf: string;
  urgent: boolean;
  steps: string[];
  never: string[];
}

export const FIRST_AID: FirstAidTopic[] = [
  {
    id: 'cpr', title: 'CPR (no pulse, not breathing)', titleAf: 'HLR', urgent: true,
    steps: [
      'Check the scene is safe and shout for help. Tap their shoulders and ask loudly if they are OK.',
      'Not responding and not breathing normally: call 10177 or 112 (or ask someone to) and get an AED if there is one.',
      'Lay them on their back on a firm surface. Place the heel of one hand on the centre of the chest, the other hand on top.',
      'Push hard and fast: about 5 to 6 cm deep, 100 to 120 compressions a minute. Let the chest rise fully each time.',
      'If you are trained: after 30 compressions give 2 rescue breaths (1 second each), then repeat. If not trained, do continuous compressions.',
      'Use the AED as soon as it arrives and follow its voice prompts. Do not stop until help takes over, they start breathing, or you cannot continue.',
    ],
    never: ['Do not stop to check for a pulse for more than 10 seconds.', 'Do not be afraid of hurting them: broken ribs are possible and are better than no CPR.'],
  },
  {
    id: 'choking', title: 'Choking', titleAf: 'Versmoring', urgent: true,
    steps: [
      'If they can cough, speak or breathe, encourage them to keep coughing.',
      'If they cannot breathe, cough or speak: give up to 5 firm back blows between the shoulder blades with the heel of your hand.',
      'Then up to 5 abdominal thrusts: stand behind, fist just above the navel, other hand over it, pull sharply inwards and upwards.',
      'Alternate 5 back blows and 5 thrusts. Call 10177 or 112 if it does not clear quickly.',
      'If they become unconscious, lay them down, call for help and start CPR.',
      'Infants (under 1 year): 5 back blows face-down along your forearm, then 5 chest thrusts with two fingers. No abdominal thrusts.',
    ],
    never: ['Do not slap the back of someone who can still cough.', 'Do not put your fingers blindly in the mouth.'],
  },
  {
    id: 'bleeding', title: 'Severe bleeding', titleAf: 'Bloeding', urgent: true,
    steps: [
      'Call 10177 or 112 for heavy bleeding. Wear gloves or use a plastic bag if you can.',
      'Press firmly directly on the wound with a clean cloth or bandage. Keep pressing.',
      'If blood soaks through, add more cloth on top. Do not remove the first layer.',
      'Raise the injured limb above the heart if there is no suspected fracture.',
      'Bandage firmly over the pad. Keep them lying down and warm.',
      'Only if bleeding from an arm or leg is life-threatening and pressure fails, and you know how, apply a tourniquet 5 to 7 cm above the wound and note the time.',
    ],
    never: ['Do not remove an embedded object: pad around it and press either side.', 'Do not give food or drink.'],
  },
  {
    id: 'heart-attack', title: 'Heart attack', titleAf: 'Hartaanval', urgent: true,
    steps: [
      'Signs: chest pain or pressure, pain spreading to arm, jaw or back, breathlessness, sweating, nausea.',
      'Call 10177 or 112 immediately.',
      'Help them sit down, leaning back with knees bent, and keep calm and still.',
      'If they are not allergic and a clinician has not told them otherwise, give one adult aspirin (300 mg) to chew slowly.',
      'Loosen tight clothing. Stay with them and watch their breathing.',
      'If they collapse and stop breathing normally, start CPR.',
    ],
    never: ['Do not let them walk or drive themselves.', 'Do not give aspirin to someone who is allergic to it.'],
  },
  {
    id: 'stroke', title: 'Stroke', titleAf: 'Beroerte', urgent: true,
    steps: [
      'Think FAST: Face drooping, Arm weakness, Speech difficulty, Time to call 10177 or 112.',
      'Note the time symptoms started and tell the paramedics.',
      'Keep them comfortable, lying on their side with head slightly raised if drowsy.',
      'Stay with them, reassure them and check breathing.',
    ],
    never: ['Do not give food, drink or tablets.', 'Do not wait to see if symptoms pass.'],
  },
  {
    id: 'burns', title: 'Burns and scalds', titleAf: 'Brandwonde', urgent: false,
    steps: [
      'Move away from the source. Put out flames: stop, drop and roll, or smother with a blanket.',
      'Cool the burn under cool running water for 20 minutes. Remove rings, watches and loose clothing near the burn unless stuck to the skin.',
      'Cover loosely with clean cling film or a clean non-fluffy dressing.',
      'Call 10177 or 112 for burns that are large, deep, on the face, hands, genitals or airway, or from chemicals or electricity.',
      'Treat for shock if needed: lie down, keep warm.',
    ],
    never: ['Do not use ice, butter, toothpaste or oil.', 'Do not burst blisters.', 'Do not remove clothing that is stuck to the burn.'],
  },
  {
    id: 'fractures', title: 'Broken bones', titleAf: 'Breuk', urgent: false,
    steps: [
      'Keep the injured part still. Support it in the position found with padding or a sling.',
      'Control any bleeding with a pad around (not on) protruding bone.',
      'Apply a cold pack wrapped in cloth to reduce swelling.',
      'Do not let them eat or drink in case surgery is needed.',
      'Call 10177 or 112 for suspected neck or back injury, open fractures, or a fracture of the thigh or pelvis. Do not move them.',
    ],
    never: ['Do not try to straighten the bone.', 'Do not move someone with a suspected spinal injury unless in immediate danger.'],
  },
  {
    id: 'seizures', title: 'Seizures', titleAf: 'Aanval', urgent: false,
    steps: [
      'Note the time. Clear hard or sharp objects away and cushion the head.',
      'Loosen anything tight around the neck.',
      'Let the seizure run its course. Stay with them.',
      'When the shaking stops, place them in the recovery position and check breathing.',
      'Call 10177 or 112 if it lasts more than 5 minutes, repeats, they are injured, pregnant, or it is their first seizure.',
    ],
    never: ['Do not hold them down.', 'Do not put anything in their mouth.'],
  },
  {
    id: 'allergy', title: 'Severe allergic reaction', titleAf: 'Allergiese reaksie', urgent: true,
    steps: [
      'Signs: swelling of face or throat, wheezing, difficulty breathing, hives, dizziness, collapse.',
      'Call 10177 or 112. Use their adrenaline auto-injector straight away into the outer thigh (through clothing if needed).',
      'Lay them flat with legs raised. If breathing is difficult let them sit up. If pregnant lie on the left side.',
      'If there is no improvement after 5 minutes and a second injector is available, give it.',
      'Stay with them. Start CPR if they stop breathing.',
    ],
    never: ['Do not stand them up suddenly.', 'Do not give anything by mouth.'],
  },
  {
    id: 'diabetic', title: 'Diabetic emergency (low sugar)', titleAf: 'Diabetiese noodgeval', urgent: false,
    steps: [
      'Signs of low blood sugar: shaky, sweaty, confused, pale, hungry, odd behaviour.',
      'If they are awake and can swallow, give 15 to 20 g of fast sugar: 150 ml fruit juice or cooldrink, or glucose tablets.',
      'Wait 10 to 15 minutes. If not improving, repeat once and call 10177 or 112.',
      'Once better, give a snack such as a sandwich or biscuits.',
      'If they become drowsy or unconscious, place them in the recovery position and call 10177 or 112.',
    ],
    never: ['Do not put food or drink in the mouth of someone who is not fully awake.'],
  },
];
