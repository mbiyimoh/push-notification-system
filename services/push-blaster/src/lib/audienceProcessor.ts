// Audience Processing Engine
// Parallel audience generation and caching for sequence campaigns

import { UniversalAutomation, AutomationPush } from '@/types/automation';
import { automationIntegration } from './automationIntegration';
import { automationLogger } from './automationLogger';
import fs from 'fs';
import path from 'path';

export interface AudienceJob {
  pushId: string;
  pushTitle: string;
  sequenceOrder: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audienceSize: number;
  eligibleUsers: number;
  excludedUsers: number;
  csvPath?: string;
  userIds?: string[];
  error?: string;
  startTime?: string;
  endTime?: string;
  processingTime?: number;
}

export interface AudienceProcessingResult {
  success: boolean;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalProcessingTime: number;
  jobs: AudienceJob[];
  cacheManifest: AudienceCacheManifest;
  error?: string;
}

export interface AudienceCacheManifest {
  automationId: string;
  executionId: string;
  generatedAt: string;
  expiresAt: string;
  totalAudiences: number;
  cacheDirectory: string;
  jobs: AudienceJob[];
}

export class AudienceProcessor {
  private logPrefix = '[AudienceProcessor]';
  private cacheDirectory: string;
  private activeJobs: Map<string, AudienceJob[]> = new Map();

  constructor() {
    this.cacheDirectory = path.join(process.cwd(), '.automations', 'audience-cache');
    this.ensureCacheDirectory();
  }

  /**
   * Process all audiences for a sequence in parallel
   */
  async processSequenceAudiences(
    automation: UniversalAutomation,
    executionId: string,
    leadTimeMinutes: number = 30
  ): Promise<AudienceProcessingResult> {
    const startTime = Date.now();
    
    try {
      this.log(`Starting parallel audience processing for ${automation.id} (${automation.pushSequence.length} pushes)`);

      // Create jobs for each push
      const jobs: AudienceJob[] = automation.pushSequence.map(push => ({
        pushId: push.id,
        pushTitle: push.title,
        sequenceOrder: push.sequenceOrder,
        status: 'pending',
        audienceSize: 0,
        eligibleUsers: 0,
        excludedUsers: 0
      }));

      this.activeJobs.set(executionId, jobs);

      // Process jobs in parallel with controlled concurrency
      const batchSize = 3; // Process 3 audiences at a time to avoid overwhelming services
      const completedJobs: AudienceJob[] = [];
      let failedJobs = 0;

      for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = jobs.slice(i, i + batchSize);
        const batchPromises = batch.map(job => this.processAudienceJob(automation, job, executionId));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const [index, result] of batchResults.entries()) {
          const job = batch[index];
          if (result.status === 'fulfilled') {
            completedJobs.push(result.value);
          } else {
            job.status = 'failed';
            job.error = result.reason?.message || 'Unknown error';
            failedJobs++;
            completedJobs.push(job);
          }
        }

        // Small delay between batches to prevent overwhelming services
        if (i + batchSize < jobs.length) {
          await this.delay(1000);
        }
      }

      // Create cache manifest
      const cacheManifest = await this.createCacheManifest(
        automation.id,
        executionId,
        completedJobs,
        leadTimeMinutes
      );

      // Save cache manifest
      await this.saveCacheManifest(cacheManifest);

      const totalProcessingTime = Date.now() - startTime;
      
      this.log(`Audience processing completed: ${completedJobs.length - failedJobs}/${completedJobs.length} successful`);

      return {
        success: failedJobs === 0,
        totalJobs: jobs.length,
        completedJobs: completedJobs.length - failedJobs,
        failedJobs,
        totalProcessingTime,
        jobs: completedJobs,
        cacheManifest
      };

    } catch (error: any) {
      this.logError(`Audience processing failed for ${automation.id}`, error);
      
      return {
        success: false,
        totalJobs: automation.pushSequence.length,
        completedJobs: 0,
        failedJobs: automation.pushSequence.length,
        totalProcessingTime: Date.now() - startTime,
        jobs: [],
        cacheManifest: {} as AudienceCacheManifest,
        error: error.message
      };
    } finally {
      this.activeJobs.delete(executionId);
    }
  }

  /**
   * Process individual audience job
   */
  private async processAudienceJob(
    automation: UniversalAutomation,
    job: AudienceJob,
    executionId: string
  ): Promise<AudienceJob> {
    const startTime = Date.now();
    
    try {
      job.status = 'processing';
      job.startTime = new Date().toISOString();

      this.log(`Processing audience for push: ${job.pushTitle}`);

      // Find the corresponding push
      const push = automation.pushSequence.find(p => p.id === job.pushId);
      if (!push) {
        throw new Error(`Push not found: ${job.pushId}`);
      }

      // Generate base audience
      const audienceResult = await automationIntegration.generateAudience(automation, push);
      
      if (!audienceResult.success) {
        throw new Error(`Audience generation failed: ${audienceResult.error}`);
      }

      // Load user IDs from CSV
      const userIds = await this.loadUserIdsFromCsv(audienceResult.csvPath);
      job.audienceSize = userIds.length;

      // Apply cadence filtering
      const filteredResult = await automationIntegration.filterAudienceWithCadence(
        automation,
        push,
        userIds
      );

      if (filteredResult.success) {
        job.eligibleUsers = filteredResult.eligibleUserIds.length;
        job.excludedUsers = filteredResult.excludedCount;
        job.userIds = filteredResult.eligibleUserIds;
      } else {
        // Fall back to original audience if filtering fails
        this.log(`Warning: Cadence filtering failed for ${job.pushId}, using original audience`);
        job.eligibleUsers = userIds.length;
        job.excludedUsers = 0;
        job.userIds = userIds;
      }

      // Cache the audience data
      const cacheFilePath = await this.cacheAudienceData(executionId, job);
      job.csvPath = cacheFilePath;

      job.status = 'completed';
      job.endTime = new Date().toISOString();
      job.processingTime = Date.now() - startTime;

      this.log(`Audience job completed for ${job.pushTitle}: ${job.eligibleUsers} eligible users`);

      return job;

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.endTime = new Date().toISOString();
      job.processingTime = Date.now() - startTime;

      this.logError(`Audience job failed for ${job.pushId}`, error);
      return job;
    }
  }

  /**
   * Load cached audience for execution
   */
  async loadCachedAudience(executionId: string): Promise<AudienceCacheManifest | null> {
    try {
      const manifestPath = path.join(this.cacheDirectory, `${executionId}-manifest.json`);
      
      if (!fs.existsSync(manifestPath)) {
        return null;
      }

      const manifestData = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestData) as AudienceCacheManifest;

      // Check if cache is expired
      if (new Date() > new Date(manifest.expiresAt)) {
        this.log(`Cache expired for execution ${executionId}, cleaning up`);
        await this.cleanupCache(executionId);
        return null;
      }

      return manifest;

    } catch (error: any) {
      this.logError(`Failed to load cached audience for ${executionId}`, error);
      return null;
    }
  }

  /**
   * Get user IDs for specific push from cache
   */
  async getCachedPushAudience(executionId: string, pushId: string): Promise<string[]> {
    try {
      const cacheFilePath = path.join(this.cacheDirectory, `${executionId}-${pushId}.json`);
      
      if (!fs.existsSync(cacheFilePath)) {
        return [];
      }

      const cacheData = fs.readFileSync(cacheFilePath, 'utf-8');
      const jobData = JSON.parse(cacheData) as AudienceJob;

      return jobData.userIds || [];

    } catch (error: any) {
      this.logError(`Failed to load cached push audience for ${pushId}`, error);
      return [];
    }
  }

  /**
   * Validate cache integrity
   */
  async validateCache(executionId: string): Promise<{
    valid: boolean;
    issues: string[];
    manifest?: AudienceCacheManifest;
  }> {
    const issues: string[] = [];

    try {
      const manifest = await this.loadCachedAudience(executionId);
      
      if (!manifest) {
        return {
          valid: false,
          issues: ['Cache manifest not found']
        };
      }

      // Check if all job cache files exist
      for (const job of manifest.jobs) {
        const cacheFilePath = path.join(this.cacheDirectory, `${executionId}-${job.pushId}.json`);
        
        if (!fs.existsSync(cacheFilePath)) {
          issues.push(`Cache file missing for push ${job.pushId}`);
        }
      }

      // Check if cache is within expiration
      if (new Date() > new Date(manifest.expiresAt)) {
        issues.push('Cache has expired');
      }

      return {
        valid: issues.length === 0,
        issues,
        manifest
      };

    } catch (error: any) {
      return {
        valid: false,
        issues: [`Cache validation failed: ${error.message}`]
      };
    }
  }

  /**
   * Private helper methods
   */
  private async createCacheManifest(
    automationId: string,
    executionId: string,
    jobs: AudienceJob[],
    leadTimeMinutes: number
  ): Promise<AudienceCacheManifest> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leadTimeMinutes * 60 * 1000);

    return {
      automationId,
      executionId,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      totalAudiences: jobs.length,
      cacheDirectory: this.cacheDirectory,
      jobs: jobs.filter(job => job.status === 'completed')
    };
  }

  private async saveCacheManifest(manifest: AudienceCacheManifest): Promise<void> {
    const manifestPath = path.join(this.cacheDirectory, `${manifest.executionId}-manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async cacheAudienceData(executionId: string, job: AudienceJob): Promise<string> {
    const cacheFilePath = path.join(this.cacheDirectory, `${executionId}-${job.pushId}.json`);
    fs.writeFileSync(cacheFilePath, JSON.stringify(job, null, 2));
    return cacheFilePath;
  }

  private async loadUserIdsFromCsv(csvPath: string | undefined): Promise<string[]> {
    if (!csvPath) {
      return [];
    }

    try {
      // In production, this would parse the actual CSV file
      // For now, we'll simulate with sample data
      return Array.from({ length: 100 }, (_, i) => `user_${i + 1}`);
    } catch (error) {
      this.logError('Failed to load user IDs from CSV', error);
      return [];
    }
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDirectory)) {
      fs.mkdirSync(this.cacheDirectory, { recursive: true });
      this.log(`Created audience cache directory: ${this.cacheDirectory}`);
    }
  }

  private async cleanupCache(executionId: string): Promise<void> {
    try {
      const files = fs.readdirSync(this.cacheDirectory)
        .filter(file => file.startsWith(executionId));

      for (const file of files) {
        const filePath = path.join(this.cacheDirectory, file);
        fs.unlinkSync(filePath);
      }

      this.log(`Cleaned up cache for execution: ${executionId}`);
    } catch (error: any) {
      this.logError(`Failed to cleanup cache for ${executionId}`, error);
    }
  }

  /**
   * Public management methods
   */
  async cleanupExpiredCache(): Promise<number> {
    try {
      const files = fs.readdirSync(this.cacheDirectory)
        .filter(file => file.endsWith('-manifest.json'));

      let cleanedCount = 0;

      for (const file of files) {
        try {
          const manifestPath = path.join(this.cacheDirectory, file);
          const manifestData = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestData) as AudienceCacheManifest;

          if (new Date() > new Date(manifest.expiresAt)) {
            await this.cleanupCache(manifest.executionId);
            cleanedCount++;
          }
        } catch (error) {
          // Skip invalid manifest files
          continue;
        }
      }

      if (cleanedCount > 0) {
        this.log(`Cleaned up ${cleanedCount} expired cache entries`);
      }

      return cleanedCount;

    } catch (error: any) {
      this.logError('Failed to cleanup expired cache', error);
      return 0;
    }
  }

  getCacheStats(): {
    totalCacheEntries: number;
    cacheDirectorySize: string;
    oldestEntry?: string;
    newestEntry?: string;
  } {
    try {
      const files = fs.readdirSync(this.cacheDirectory);
      const manifests = files.filter(f => f.endsWith('-manifest.json'));

      let totalSize = 0;
      let oldestTime = Infinity;
      let newestTime = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDirectory, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
        }
        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
        }
      }

      return {
        totalCacheEntries: manifests.length,
        cacheDirectorySize: `${(totalSize / 1024).toFixed(2)} KB`,
        oldestEntry: oldestTime !== Infinity ? new Date(oldestTime).toISOString() : undefined,
        newestEntry: newestTime !== 0 ? new Date(newestTime).toISOString() : undefined
      };

    } catch (error: any) {
      this.logError('Failed to get cache stats', error);
      return {
        totalCacheEntries: 0,
        cacheDirectorySize: '0 KB'
      };
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }

  private logError(message: string, error: any): void {
    console.error(`${this.logPrefix} ${new Date().toISOString()} - ERROR: ${message}`, error);
  }
}

// Export singleton instance
export const audienceProcessor = new AudienceProcessor();