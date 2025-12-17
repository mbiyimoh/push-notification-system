// src/lib/generators/BaseAudienceGenerator.ts

import { Pool } from 'pg';
import { GeneratorOptions, GeneratorResult, GeneratorOptionsSchema } from './types';

export abstract class BaseAudienceGenerator {
  abstract readonly name: string;
  abstract readonly layerId: number;
  abstract readonly description: string;

  constructor(protected pool: Pool) {}

  /**
   * Main entry point - validates database connectivity, then executes generation
   */
  async generate(options: Partial<GeneratorOptions>): Promise<GeneratorResult> {
    const startTime = Date.now();

    try {
      // Pre-flight validation: Check database connectivity BEFORE starting
      const validation = await this.validate();
      if (!validation.valid) {
        const errorMessage = `Pre-flight validation failed: ${validation.errors.join(', ')}`;
        console.error(`[${this.name}] ${errorMessage}`);
        return {
          success: false,
          csvFiles: [],
          audienceSize: 0,
          executionTimeMs: Date.now() - startTime,
          error: errorMessage,
        };
      }

      // Validate options with defaults
      const validatedOptions = GeneratorOptionsSchema.parse(options);

      console.log(`[${this.name}] Starting generation with options:`, {
        lookbackHours: validatedOptions.lookbackHours,
        coolingHours: validatedOptions.coolingHours,
        dryRun: validatedOptions.dryRun,
      });

      // Template method pattern - subclasses implement executeGeneration
      const result = await this.executeGeneration(validatedOptions);

      result.executionTimeMs = Date.now() - startTime;

      console.log(`[${this.name}] Completed in ${result.executionTimeMs}ms:`, {
        success: result.success,
        audienceSize: result.audienceSize,
        fileCount: result.csvFiles.length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${this.name}] Generation failed:`, errorMessage);

      // Add stack trace for debugging in non-production
      if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
        console.error(`[${this.name}] Stack trace:`, error.stack);
      }

      return {
        success: false,
        csvFiles: [],
        audienceSize: 0,
        executionTimeMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Subclasses implement this method with their specific logic
   */
  protected abstract executeGeneration(options: GeneratorOptions): Promise<GeneratorResult>;

  /**
   * Validate generator is properly configured with timeout
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Test database connectivity with 5 second timeout
      console.log(`[${this.name}] Validating database connectivity...`);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database validation timeout (5s)')), 5000)
      );

      const queryPromise = this.pool.query('SELECT 1 as health_check');

      await Promise.race([queryPromise, timeoutPromise]);
      console.log(`[${this.name}] Database validation successful`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const errCode = (e as NodeJS.ErrnoException).code;
      console.error(`[${this.name}] Database validation failed:`, {
        message: errMsg,
        code: errCode,
        name: (e as Error).name,
      });
      errors.push(`Database connection failed: ${errMsg}`);
    }

    return { valid: errors.length === 0, errors };
  }
}
