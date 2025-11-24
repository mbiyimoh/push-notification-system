// Automation Storage System
// JSON-based storage extending existing scheduled pushes patterns

import fs from 'fs';
import path from 'path';
import { UniversalAutomation, ScheduledPushMigration, AutomationResponse } from '@/types/automation';

// Type definitions for legacy scheduled push data
interface ScheduledPushData {
  id: string;
  pushTitle: string;
  pushBody: string;
  deepLink?: string;
  scheduledDate: string;
  scheduledTime?: string;
  audienceCriteria?: {
    trustedTraderStatus: 'any' | 'trusted' | 'non-trusted';
    trustedTraderCandidate: 'any' | 'candidate' | 'non-candidate';
    activityDays: number;
    tradingDays: number;
    minTrades: number;
    dataPacks: string[];
  };
}

// Type for execution log data
interface ExecutionLogData {
  status?: string;
  phase?: string;
  error?: string;
  [key: string]: unknown;
}

// Type for loaded execution logs
interface ExecutionLog {
  automationId: string;
  timestamp: string;
  [key: string]: unknown;
}

// Use relative paths from process.cwd() for Railway compatibility
// In development: resolves to project root
// In production (Railway): resolves to deployment directory
const BASE_DIR = process.cwd();
const AUTOMATIONS_DIR = path.join(BASE_DIR, '.automations');
const TEMPLATES_DIR = path.join(AUTOMATIONS_DIR, 'templates');
const EXECUTIONS_DIR = path.join(AUTOMATIONS_DIR, 'executions');

export class AutomationStorage {
  private logPrefix = '[AutomationStorage]';

  constructor() {
    this.ensureDirectories();
    this.log(`Storage initialized. Using data directory: ${AUTOMATIONS_DIR}`);
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    [AUTOMATIONS_DIR, TEMPLATES_DIR, EXECUTIONS_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.log(`Created directory: ${dir}`);
      }
    });
  }

  /**
   * Save automation to JSON file
   */
  async saveAutomation(automation: UniversalAutomation): Promise<AutomationResponse> {
    try {
      const filePath = path.join(AUTOMATIONS_DIR, `${automation.id}.json`);
      
      // Update timestamp
      automation.updatedAt = new Date().toISOString();
      
      // Write to file
      fs.writeFileSync(filePath, JSON.stringify(automation, null, 2));
      
      this.log(`Automation saved: ${automation.id}`);
      
      return {
        success: true,
        data: automation,
        message: 'Automation saved successfully'
      };
    } catch (error: unknown) {
      this.logError('Failed to save automation', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to save automation: ${errorMessage}`,
        errors: [errorMessage]
      };
    }
  }

  /**
   * Load automation by ID
   */
  async loadAutomation(automationId: string): Promise<UniversalAutomation | null> {
    try {
      const filePath = path.join(AUTOMATIONS_DIR, `${automationId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const data = fs.readFileSync(filePath, 'utf-8');
      const automation = JSON.parse(data) as UniversalAutomation;
      
      this.log(`Automation loaded: ${automationId}`);
      return automation;

    } catch (error: unknown) {
      this.logError(`Failed to load automation ${automationId}`, error);
      return null;
    }
  }

  /**
   * Load all automations
   */
  async loadAllAutomations(): Promise<UniversalAutomation[]> {
    try {
      const files = fs.readdirSync(AUTOMATIONS_DIR)
        .filter(file => file.endsWith('.json') && !file.startsWith('template_'));

      const automations: UniversalAutomation[] = [];

      for (const file of files) {
        const filePath = path.join(AUTOMATIONS_DIR, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const automation = JSON.parse(data) as UniversalAutomation;
        automations.push(automation);
      }

      this.log(`Loaded ${automations.length} automations`);
      return automations;

    } catch (error: unknown) {
      this.logError('Failed to load automations', error);
      return [];
    }
  }

  /**
   * Delete automation
   */
  async deleteAutomation(automationId: string): Promise<AutomationResponse> {
    try {
      const filePath = path.join(AUTOMATIONS_DIR, `${automationId}.json`);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          message: 'Automation not found'
        };
      }

      fs.unlinkSync(filePath);

      this.log(`Automation deleted: ${automationId}`);

      return {
        success: true,
        message: 'Automation deleted successfully'
      };
    } catch (error: unknown) {
      this.logError(`Failed to delete automation ${automationId}`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to delete automation: ${errorMessage}`,
        errors: [errorMessage]
      };
    }
  }

  /**
   * List automations with filtering
   */
  async listAutomations(filters?: {
    status?: string;
    type?: string;
    template?: string;
  }): Promise<UniversalAutomation[]> {
    const automations = await this.loadAllAutomations();
    
    if (!filters) {
      return automations;
    }
    
    return automations.filter(automation => {
      if (filters.status && automation.status !== filters.status) return false;
      if (filters.type && automation.type !== filters.type) return false;
      if (filters.template && automation.template.id !== filters.template) return false;
      return true;
    });
  }

  /**
   * Migration utilities for converting scheduled pushes
   */
  async migrateScheduledPush(scheduledPushData: ScheduledPushData): Promise<UniversalAutomation> {
    const automation: UniversalAutomation = {
      id: `migrated_${scheduledPushData.id}`,
      name: `Migrated: ${scheduledPushData.pushTitle}`,
      description: `Migrated from scheduled push: ${scheduledPushData.id}`,
      type: 'single_push',
      status: 'draft', // Start as draft, to be activated manually
      isActive: true, // Set to active by default
      schedule: {
        timezone: 'America/Chicago',
        frequency: 'once',
        startDate: scheduledPushData.scheduledDate,
        executionTime: scheduledPushData.scheduledTime || '10:00',
        leadTimeMinutes: 30
      },
      template: {
        id: 'migration_template',
        name: 'Migrated Push Template',
        category: 'custom',
        isSystemTemplate: true,
        config: {
          defaultSettings: {},
          pushTemplates: [],
          requiredVariables: []
        }
      },
      pushSequence: [{
        id: `push_${scheduledPushData.id}`,
        automationId: `migrated_${scheduledPushData.id}`,
        sequenceOrder: 1,
        title: scheduledPushData.pushTitle,
        body: scheduledPushData.pushBody,
        deepLink: scheduledPushData.deepLink || '',
        layerId: 1, // Default to Layer 1 for migrations
        timing: {
          delayAfterPrevious: 0
        },
        status: 'pending'
      }],
      audienceCriteria: scheduledPushData.audienceCriteria || {
        trustedTraderStatus: 'any',
        trustedTraderCandidate: 'any',
        activityDays: 30,
        tradingDays: 30,
        minTrades: 0,
        dataPacks: []
      },
      settings: {
        testUserIds: [],
        emergencyStopEnabled: true,
        dryRunFirst: true,
        cancellationWindowMinutes: 30,
        safeguards: {
          maxAudienceSize: 10000,
          requireTestFirst: true,
          emergencyContacts: [],
          alertThresholds: {
            audienceSize: 5000,
            failureRate: 0.1
          }
        }
      },
      metadata: {
        createdBy: 'migration_system',
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return automation;
  }

  /**
   * Save migration record
   */
  async saveMigrationRecord(migration: ScheduledPushMigration): Promise<void> {
    try {
      const migrationPath = path.join(AUTOMATIONS_DIR, 'migrations.json');
      let migrations: ScheduledPushMigration[] = [];
      
      // Load existing migrations
      if (fs.existsSync(migrationPath)) {
        const data = fs.readFileSync(migrationPath, 'utf-8');
        migrations = JSON.parse(data);
      }
      
      // Add new migration
      migrations.push(migration);
      
      // Save updated migrations
      fs.writeFileSync(migrationPath, JSON.stringify(migrations, null, 2));
      
      this.log(`Migration recorded: ${migration.scheduledPushId} -> ${migration.automationId}`);

    } catch (error: unknown) {
      this.logError('Failed to save migration record', error);
    }
  }

  /**
   * Load existing scheduled pushes for migration
   */
  async loadScheduledPushes(): Promise<ScheduledPushData[]> {
    try {
      const scheduledPushesDir = path.join(process.cwd(), '.scheduled-pushes');

      if (!fs.existsSync(scheduledPushesDir)) {
        this.log('No scheduled pushes directory found');
        return [];
      }

      const files = fs.readdirSync(scheduledPushesDir)
        .filter(file => file.endsWith('.json'));

      const scheduledPushes: ScheduledPushData[] = [];

      for (const file of files) {
        const filePath = path.join(scheduledPushesDir, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const push = JSON.parse(data) as ScheduledPushData;
        scheduledPushes.push(push);
      }

      this.log(`Found ${scheduledPushes.length} scheduled pushes for potential migration`);
      return scheduledPushes;

    } catch (error: unknown) {
      this.logError('Failed to load scheduled pushes', error);
      return [];
    }
  }

  /**
   * Save execution log
   */
  async saveExecutionLog(automationId: string, executionData: ExecutionLogData): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${automationId}_${timestamp}.json`;
      const filePath = path.join(EXECUTIONS_DIR, filename);

      const logData = {
        automationId,
        timestamp: new Date().toISOString(),
        ...executionData
      };

      fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));

      this.log(`Execution log saved: ${filename}`);

    } catch (error: unknown) {
      this.logError(`Failed to save execution log for ${automationId}`, error);
    }
  }

  /**
   * Load execution logs for automation
   */
  async loadExecutionLogs(automationId: string): Promise<ExecutionLog[]> {
    try {
      const files = fs.readdirSync(EXECUTIONS_DIR)
        .filter(file => file.startsWith(automationId) && file.endsWith('.json'))
        .sort(); // Chronological order

      const logs: ExecutionLog[] = [];

      for (const file of files) {
        const filePath = path.join(EXECUTIONS_DIR, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const log = JSON.parse(data) as ExecutionLog;
        logs.push(log);
      }

      return logs;

    } catch (error: unknown) {
      this.logError(`Failed to load execution logs for ${automationId}`, error);
      return [];
    }
  }

  /**
   * Backup and restore utilities
   */
  async createBackup(): Promise<{ success: boolean; backupPath?: string; message: string }> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(process.cwd(), `automation-backup-${timestamp}.json`);
      
      const allAutomations = await this.loadAllAutomations();
      
      const backupData = {
        timestamp: new Date().toISOString(),
        automationCount: allAutomations.length,
        automations: allAutomations
      };
      
      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
      
      this.log(`Backup created: ${backupPath}`);
      
      return {
        success: true,
        backupPath,
        message: `Backup created with ${allAutomations.length} automations`
      };

    } catch (error: unknown) {
      this.logError('Failed to create backup', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to create backup: ${errorMessage}`
      };
    }
  }

  /**
   * Logging utilities
   */
  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }

  private logError(message: string, error: unknown): void {
    console.error(`${this.logPrefix} ${new Date().toISOString()} - ERROR: ${message}`, error);
  }
}

// Export singleton instance
export const automationStorage = new AutomationStorage();