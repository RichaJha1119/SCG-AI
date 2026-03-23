export type ComponentType =
  | 'apex-trigger'
  | 'apex-class'
  | 'lwc'
  | 'integration'
  | 'batch'
  | 'rest-api'
  | 'cpq';

export type LwcArchitectureMode = 'auto' | 'single' | 'nested';

export interface GeneratedArtifact {
  bundle?: string;
  type: string;
  name: string;
  extension: string;
  content: string;
}

export interface GenerationResult {
  components: GeneratedArtifact[];
  summary: string;
  governorLimitNotes: string[];
  deploymentSteps: string[];
  dependencies: string[];
}

export interface SavedComponent {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  componentType: ComponentType;
  components: GeneratedArtifact[];
  summary: string;
  governorLimitNotes: string[];
  deploymentSteps: string[];
  dependencies: string[];
  savedAt: string;
  updatedAt?: string;
  version: number;
}

export interface SalesforceConnection {
  sessionId: string;
  username: string;
  orgId: string;
  instanceUrl: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  'apex-trigger': 'Apex Trigger',
  'apex-class': 'Apex Class',
  'lwc': 'Lightning Web Component',
  'integration': 'Integration Service',
  'batch': 'Batch Apex',
  'rest-api': 'REST API',
  'cpq': 'CPQ Configuration',
};

export const COMPONENT_TYPE_COLORS: Record<ComponentType, string> = {
  'apex-trigger': 'bg-orange-500/20 text-orange-300',
  'apex-class': 'bg-blue-500/20 text-blue-300',
  'lwc': 'bg-purple-500/20 text-purple-300',
  'integration': 'bg-green-500/20 text-green-300',
  'batch': 'bg-yellow-500/20 text-yellow-300',
  'rest-api': 'bg-cyan-500/20 text-cyan-300',
  'cpq': 'bg-pink-500/20 text-pink-300',
};
