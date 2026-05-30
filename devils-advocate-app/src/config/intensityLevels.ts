import type { IntensityConfig } from '../types/debate';

export const INTENSITY_LEVELS: IntensityConfig[] = [
  {
    level: 'friendly',
    label: 'Friendly Discussion',
    emoji: '🟢',
    color: 'text-green-400',
    temperature: 0.3,
    topP: 0.8,
    promptSuffix: 'Be conversational and approachable. Acknowledge good points made by the user. Offer gentle counter-perspectives without being aggressive. Maintain a friendly, educational tone.',
  },
  {
    level: 'challenging',
    label: 'Challenging Debate',
    emoji: '🟡',
    color: 'text-yellow-400',
    temperature: 0.7,
    topP: 0.9,
    promptSuffix: 'Be firm but fair. Challenge weak arguments directly. Do not let logical inconsistencies slide. Push the user to strengthen their reasoning. Maintain intellectual rigor while remaining respectful.',
  },
  {
    level: 'devil',
    label: 'Devil Mode',
    emoji: '🔴',
    color: 'text-red-500',
    temperature: 1.0,
    topP: 0.95,
    promptSuffix: 'Do not concede any points. Utilize relentless counter-questioning. Maximize argument complexity and rebuttal frequency. Exploit every logical gap ruthlessly. Be aggressive, creative, and unpredictable in your rhetoric. Make the user earn every single point.',
  },
];

export const getIntensityConfig = (level: string): IntensityConfig =>
  INTENSITY_LEVELS.find((i) => i.level === level) ?? INTENSITY_LEVELS[0];
