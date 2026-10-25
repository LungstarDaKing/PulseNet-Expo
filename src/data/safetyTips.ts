/** Safety tips ported from SafetyTipsService (these were hard-coded "mock" strings in the original service;
 * they are now real static content with stable ids so reading progress persists). */
export interface TipCategory {
  id: string;
  title: string;
  tips: string[];
}

export const TIP_CATEGORIES: TipCategory[] = [
  { id: 'personal_safety', title: 'Personal safety', tips: [
    'Trust your instincts - if a situation feels unsafe, remove yourself from it.',
    'Stay aware of your surroundings - avoid distractions like headphones when walking alone.',
    'Share your location with trusted friends or family when going out, especially at night.',
    'Have a plan - know emergency exits and safe places in buildings you frequent.',
    "Keep your phone charged and accessible when you're out alone.",
    'Use well-lit, populated paths when walking at night.',
    'If being followed, change direction or go to a public place like a shop or police station.',
    "Don't overshare your location or plans on social media in real time.",
    'Have your keys ready when approaching your car or home.',
    'Consider a self-defence class to build confidence and skills.',
  ] },
  { id: 'home_safety', title: 'Home safety', tips: [
    'Install smoke detectors on every level of your home and test them monthly.',
    'Create and practise a fire escape plan with your family.',
    'Keep a fire extinguisher in the kitchen and know how to use it.',
    'Secure heavy furniture to walls to prevent tipping, especially around children.',
    'Use safety gates at the top and bottom of stairs if you have young children.',
    'Keep cleaning products and medicines locked away from children.',
    'Install carbon monoxide detectors near sleeping areas.',
    "Don't leave cooking unattended, especially with oil or high heat.",
    'Keep emergency numbers posted near your phone.',
    'Consider a home alarm or smart doorbell for added protection.',
  ] },
  { id: 'travel_safety', title: 'Travel safety', tips: [
    'Research your destination - know the safe areas and any travel advisories.',
    'Share your itinerary with someone you trust and check in regularly.',
    'Keep digital and physical copies of important documents (passport, ID, insurance).',
    'Be cautious with public Wi-Fi - avoid sensitive logins on unsecured networks.',
    'Use reputable transport and verify the driver and plate before getting in.',
    'Keep valuables out of sight and use hotel safes when available.',
    'Learn basic phrases in the local language, especially for emergencies.',
    'Be careful with food and water in unfamiliar places.',
    'Have a plan for getting help if you lose your phone or wallet.',
    'Consider travel insurance that covers medical emergencies and evacuation.',
  ] },
  { id: 'emergency_preparedness', title: 'Emergency preparedness', tips: [
    'Create an emergency kit with water, food, medication and supplies for at least 72 hours.',
    'Develop a family emergency plan with meeting points and communication methods.',
    'Know how to turn off gas, water and electricity in your home.',
    'Keep important documents in a fireproof and waterproof container.',
    'Keep a battery-powered or hand-crank radio for emergency information.',
    "Know the emergency plans for your workplace and children's schools.",
    'Practise your emergency plan with your family regularly.',
    'Get trained in CPR and basic first aid.',
    "Keep your car's fuel tank at least half full.",
    'Stay informed about alerts in your area.',
  ] },
  { id: 'digital_safety', title: 'Digital safety', tips: [
    'Use strong, unique passwords and consider a password manager.',
    'Turn on two-factor authentication wherever possible.',
    "Be cautious of phishing - don't click suspicious links or share personal information.",
    'Keep software and apps updated.',
    'Review privacy settings on social media regularly.',
    "Be careful what you share online - once it's posted it can be hard to remove.",
    'Only enter payment details on secure websites (https).',
    'Back up important data regularly.',
    'Monitor your bank accounts for unauthorised activity.',
    'Teach children about online safety.',
  ] },
  { id: 'health_wellness', title: 'Health and wellness', tips: [
    'Regular exercise boosts physical and mental health - aim for about 150 minutes a week.',
    "Stay hydrated through the day, not only when you're thirsty.",
    'Most adults need 7 to 9 hours of sleep.',
    'Practise stress management such as breathing exercises, meditation or yoga.',
    'Eat a balanced diet with plenty of fruit, vegetables and whole grains.',
    'Schedule regular check-ups with your healthcare provider.',
    "Don't ignore persistent symptoms - early detection improves outcomes.",
    'Practise good hygiene to prevent the spread of illness.',
    'Limit alcohol and avoid tobacco.',
    'Stay socially connected - relationships support wellbeing.',
  ] },
];
