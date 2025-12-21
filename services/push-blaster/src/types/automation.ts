// Universal Automation Data Models
// Building on existing push-blaster patterns and extending scheduled push architecture

export interface UniversalAutomation {
  id: string;
  name: string;
  description: string;
  type: AutomationType;
  status: AutomationStatus;
  isActive: boolean;
  schedule: AutomationSchedule;
  template: AutomationTemplate;
  pushSequence: AutomationPush[];
  audienceCriteria: AudienceCriteria;
  settings: AutomationSettings;
  metadata: AutomationMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationPush {
  id: string;
  automationId: string;
  sequenceOrder: number;
  title: string;
  body: string;
  deepLink: string;
  layerId: number; // 1-5 for Layer classification (5 = New User Series)
  timing: PushTiming;
  audienceQuery?: string; // For sequence-specific audience generation
  status: PushStatus;
}

export interface AutomationSchedule {
  timezone: string;
  frequency: ScheduleFrequency;
  startDate: string;
  endDate?: string;
  cronExpression?: string;
  executionTime: string; // HH:MM format
  leadTimeMinutes: number; // Default 30 for audience generation
}

export interface AutomationTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  isSystemTemplate: boolean;
  config: TemplateConfig;
}

export interface AutomationSettings {
  testUserIds: string[];
  maxAudienceSize?: number;
  emergencyStopEnabled: boolean;
  dryRunFirst: boolean;
  cancellationWindowMinutes: number; // Default 30
  safeguards: SafeguardConfig;
}

export interface AutomationMetadata {
  createdBy: string;
  lastExecutedAt?: string;
  nextExecutionAt?: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastError?: string;
  templateId?: string;
  templateVariables?: Record<string, string | number | boolean | null>;
  // UI-specific fields populated from execution stats
  lastRunWithin24h?: boolean;
  lastAudienceSize?: number;
}

// Extending existing AudienceCriteria interface from scheduled pushes
export interface AudienceCriteria {
  trustedTraderStatus: 'any' | 'trusted' | 'non-trusted';
  trustedTraderCandidate: 'any' | 'candidate' | 'non-candidate';
  activityDays: number;
  tradingDays: number;
  minTrades: number;
  dataPacks: string[];
  customQuery?: string;
  customScript?: ScriptConfig;
  testMode?: boolean; // Flag to indicate test mode scheduling
}

export interface ScriptConfig {
  scriptId: string;
  scriptName: string;
  parameters?: Record<string, any>;
}

// Execution Configuration
export interface ExecutionConfig {
  currentPhase: ExecutionPhase;
  startTime: string;
  expectedEndTime: string;
  audienceGenerated: boolean;
  testsSent: boolean;
  cancellationDeadline: string;
  canCancel: boolean;
  emergencyStopRequested: boolean;
}

// Enums and Types
export type AutomationType = 
  | 'single_push'      // Convert existing scheduled pushes
  | 'sequence'         // Multi-push campaigns like onboarding
  | 'recurring'        // Daily/weekly automations
  | 'triggered';       // Event-based (future)

export type AutomationStatus = 
  | 'draft'
  | 'active'
  | 'inactive'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ScheduleFrequency = 
  | 'once'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type TemplateCategory = 
  | 'onboarding'
  | 'retention'
  | 'reactivation'
  | 'feature_announcement'
  | 'custom';

export type ExecutionPhase = 
  | 'waiting'
  | 'audience_generation'
  | 'test_sending'
  | 'cancellation_window'
  | 'live_execution'
  | 'completed'
  | 'failed';

export type PushStatus = 
  | 'pending'
  | 'audience_ready'
  | 'test_sent'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface PushTiming {
  delayAfterPrevious: number; // Minutes after previous push in sequence
  absoluteTime?: string; // Optional: specific time for this push
}

export interface TemplateConfig {
  defaultSettings: Partial<AutomationSettings>;
  pushTemplates: Partial<AutomationPush>[];
  requiredVariables: string[];
  usedVariables?: Record<string, string | number | boolean | null>;
  audienceTemplate?: Partial<AudienceCriteria>;
}

export interface SafeguardConfig {
  maxAudienceSize: number;
  requireTestFirst: boolean;
  emergencyContacts: string[];
  alertThresholds: {
    audienceSize: number;
    failureRate: number;
  };
}

// Migration interfaces for converting scheduled pushes
export interface ScheduledPushMigration {
  scheduledPushId: string;
  automationId: string;
  migrationDate: string;
  preserveOriginal: boolean;
}

// Response interfaces for API communication
export interface AutomationResponse {
  success: boolean;
  data?: UniversalAutomation | UniversalAutomation[];
  message: string;
  errors?: string[];
}

export interface ExecutionResponse {
  success: boolean;
  executionId: string;
  status: AutomationStatus;
  nextPhase?: ExecutionPhase;
  message: string;
  debugInfo?: unknown;
}