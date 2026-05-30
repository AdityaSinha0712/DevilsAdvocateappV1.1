import type { FallacyType } from '../types/debate';

export interface FallacyDefinition {
  type: FallacyType;
  name: string;
  category: 'logical' | 'cognitive' | 'rhetorical';
  description: string;
  heuristic: string;
  icon: string;
}

export const FALLACY_TAXONOMY: FallacyDefinition[] = [
  {
    type: 'strawman',
    name: 'Strawman',
    category: 'logical',
    description: 'Misrepresenting or exaggerating an argument to make it easier to attack.',
    heuristic: "Identifies instances where the user misrepresents, exaggerates, or fabricates the AI's previous argument.",
    icon: '🎃',
  },
  {
    type: 'ad_hominem',
    name: 'Ad Hominem',
    category: 'logical',
    description: 'Attacking the person making the argument rather than the argument itself.',
    heuristic: 'Flags explicit personal attacks, insults, or derogatory references directed at the persona rather than the substance.',
    icon: '🎯',
  },
  {
    type: 'false_dilemma',
    name: 'False Dilemma',
    category: 'logical',
    description: 'Presenting only two options when more exist.',
    heuristic: 'Detects binary thinking; recognizes when the user restricts a complex spectrum to a strict either/or scenario.',
    icon: '⚡',
  },
  {
    type: 'slippery_slope',
    name: 'Slippery Slope',
    category: 'logical',
    description: 'Claiming one event will inevitably lead to catastrophic chain reactions without proof.',
    heuristic: 'Flags assertions predicting a small step will cascade into catastrophic events without logical proof.',
    icon: '⛷️',
  },
  {
    type: 'texas_sharpshooter',
    name: 'Texas Sharpshooter',
    category: 'cognitive',
    description: 'Cherry-picking data clusters that suit the argument while ignoring contrary evidence.',
    heuristic: 'Detects cherry-picking of data that suits the argument while ignoring a massive body of contrary evidence.',
    icon: '🎯',
  },
  {
    type: 'red_herring',
    name: 'Red Herring',
    category: 'rhetorical',
    description: 'Introducing irrelevant information to distract from the core topic.',
    heuristic: 'Identifies introduction of irrelevant information or tangential subjects designed to distract from the core debate.',
    icon: '🐟',
  },
  {
    type: 'no_true_scotsman',
    name: 'No True Scotsman',
    category: 'logical',
    description: 'Redefining group parameters to exclude counterexamples.',
    heuristic: 'Flags ad hoc rescues of generalized claims by arbitrarily redefining parameters to exclude counterexamples.',
    icon: '🏴',
  },
  {
    type: 'appeal_to_emotion',
    name: 'Appeal to Emotion',
    category: 'logical',
    description: 'Manipulating emotions instead of presenting valid evidence.',
    heuristic: 'Identifies arguments that manipulate fear, pity, or joy in place of valid, logical evidence.',
    icon: '😢',
  },
  {
    type: 'bandwagon',
    name: 'Bandwagon Fallacy',
    category: 'logical',
    description: 'Arguing something is true because many people believe it.',
    heuristic: 'Detects arguments asserting a proposition must be true simply because many people believe it.',
    icon: '🚂',
  },
  {
    type: 'argument_from_ignorance',
    name: 'Argument from Ignorance',
    category: 'logical',
    description: "Claiming something is true because it hasn't been proven false.",
    heuristic: 'Flags assertions that a proposition is true simply because it has not yet been proven false, or vice versa.',
    icon: '❓',
  },
];

export const getFallacyByType = (type: FallacyType): FallacyDefinition | undefined =>
  FALLACY_TAXONOMY.find((f) => f.type === type);
