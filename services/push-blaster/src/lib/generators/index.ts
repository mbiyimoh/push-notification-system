// src/lib/generators/index.ts

import { BaseAudienceGenerator } from './BaseAudienceGenerator';
import { Layer3BehaviorGenerator } from './layer3/Layer3BehaviorGenerator';
import { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// Export types
export * from './types';
export { BaseAudienceGenerator } from './BaseAudienceGenerator';
export { CsvGenerator } from './CsvGenerator';
export { Layer3BehaviorGenerator } from './layer3/Layer3BehaviorGenerator';
export { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// Generator registry for lookup by name or legacy script ID
class GeneratorRegistry {
  private generators = new Map<string, BaseAudienceGenerator>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Lazy initialization - creates generators on first access
   * This prevents pool creation during Next.js build phase
   * Uses async dynamic import to properly resolve @/ alias at runtime
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    // Skip during Next.js build phase
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.log('[GeneratorRegistry] Skipping initialization during build phase');
      return;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    console.log('[GeneratorRegistry] Initializing generators...');

    try {
      // Dynamic import with @/ alias - properly resolved by Next.js at runtime
      const dbModule = await import('@/lib/db');
      const pool = dbModule.default;

      if (!pool) {
        throw new Error('Pool is undefined after import');
      }

      console.log('[GeneratorRegistry] Pool imported successfully');

      // Register all generators
      this.register(new Layer3BehaviorGenerator(pool));
      this.register(new Layer5WaterfallGenerator(pool));

      this.initialized = true;
      console.log(`[GeneratorRegistry] Registered ${this.generators.size / 2} generators`);
    } catch (error) {
      console.error('[GeneratorRegistry] Initialization failed:', error);
      throw error;
    }
  }

  register(generator: BaseAudienceGenerator): void {
    this.generators.set(generator.name, generator);
    // Also register by legacy script ID for backward compatibility
    const legacyId = this.getLegacyScriptId(generator.name);
    if (legacyId) {
      this.generators.set(legacyId, generator);
    }
  }

  async get(nameOrScriptId: string): Promise<BaseAudienceGenerator | undefined> {
    await this.ensureInitialized();
    return this.generators.get(nameOrScriptId);
  }

  async has(nameOrScriptId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.generators.has(nameOrScriptId);
  }

  async list(): Promise<string[]> {
    await this.ensureInitialized();
    return Array.from(new Set(
      Array.from(this.generators.values()).map(g => g.name)
    ));
  }

  private getLegacyScriptId(name: string): string | null {
    const mapping: Record<string, string> = {
      'layer3-behavior': 'generate_layer_3_push_csvs',
      'layer5-waterfall': 'generate_new_user_waterfall',
    };
    return mapping[name] ?? null;
  }
}

// Create singleton registry (generators registered lazily on first access)
export const generatorRegistry = new GeneratorRegistry();
