# TypeScript-Native Automation Engine

**Slug:** typescript-native-automation-engine
**Author:** Claude Code
**Date:** 2025-11-28
**Branch:** preflight/typescript-automation-engine
**Related:** [Python DB Connectivity Problem](./python-db-connectivity-problem.md)

---

## 1) Intent & Assumptions

### Task Brief

Build a new TypeScript-native automation engine from scratch that replaces the Python-based audience generation scripts. The new engine should:
- Borrow architecture patterns from the existing push-blaster system where sensible
- Be built as a **separate system** (not overwriting existing code)
- Eliminate Python dependency entirely
- Use the existing Node.js connection pool for database queries
- Maintain the same audience generation capabilities
- Integrate with the existing push notification delivery pipeline

### Assumptions

- The new system will coexist with the existing push-blaster during migration
- Existing Firebase integration (`firebaseAdmin.ts`) can be reused
- The main Tradeblock PostgreSQL database schema is stable
- Cadence service integration patterns remain the same
- Test mode and production mode behavior should be preserved
- Railway deployment constraints (no persistent volume needed for core functionality)

### Out of Scope

- Migration of existing automation configurations (manual recreation acceptable)
- Changes to the push-cadence-service
- Firebase Admin SDK replacement
- Database schema modifications
- UI redesign (existing UI patterns can be reused)
- Historical execution data migration

---

## 2) Pre-reading Log

| File | Takeaway |
|------|----------|
| `src/lib/automationEngine.ts` | Singleton cron scheduler with 5-phase execution pipeline (audience gen → test send → cancellation window → live send → cleanup). Uses `node-cron` for scheduling, tracks active executions in memory. |
| `src/lib/scriptExecutor.ts` | Spawns Python subprocesses for audience generation, discovers scripts from filesystem, handles CSV output paths. Root cause of Railway connectivity issues. |
| `src/lib/automationStorage.ts` | File-based JSON persistence at `/app/.automations/`. Stores automation configs, templates, and execution logs. |
| `src/lib/db.ts` | Node.js `pg` Pool with SSL, 10 max connections, 30s idle timeout, 10s connect timeout. **This works reliably** - use for new system. |
| `audience-generation-scripts/generate_layer_2_push_csv.py` | Complex audience generation: fetches trending products, matches users to highest-ranked products, enriches with wishlist counts, applies demand filtering, generates separate CSVs for #1 vs #2-10 trending. |
| `audience-generation-scripts/generate_new_user_waterfall.py` | Waterfall extraction pattern: 5 levels of mutually exclusive audiences based on onboarding completion. Uses set operations for exclusion. |
| `shared/python-utilities/sql_utils.py` | Database connection with retry logic and SSL. **This is the failing component** - creates new connections that get blocked by AWS RDS security groups. |
| `developer-guides/push-blaster-guide.md` | Full system documentation including API routes, timeline execution, lead times (3 min test, 30 min real). |

---

## 3) Codebase Map

### Existing System Architecture

```
push-blaster/
├── src/
│   ├── app/
│   │   ├── api/                          # Next.js API routes
│   │   │   ├── automation/
│   │   │   │   ├── recipes/route.ts      # CRUD for automations
│   │   │   │   ├── control/route.ts      # Pause/resume/execute_now
│   │   │   │   ├── test/[id]/route.ts    # Test execution
│   │   │   │   └── monitor/route.ts      # Execution status
│   │   │   └── send-push/route.ts        # Push delivery
│   │   ├── components/                   # React UI components
│   │   └── page.tsx                      # Dashboard
│   │
│   ├── lib/
│   │   ├── automationEngine.ts           # Core orchestrator (KEEP PATTERN)
│   │   ├── automationStorage.ts          # File-based persistence (KEEP PATTERN)
│   │   ├── scriptExecutor.ts             # Python subprocess (REPLACE)
│   │   ├── audienceProcessor.ts          # Parallel processing (ADAPT)
│   │   ├── db.ts                         # PostgreSQL pool (REUSE)
│   │   ├── firebaseAdmin.ts              # Firebase SDK (REUSE)
│   │   └── types/automation.ts           # TypeScript types (EXTEND)
│   │
│   └── audience-generation-scripts/      # Python scripts (REPLACE)
│       ├── generate_layer_2_push_csv.py
│       ├── generate_layer_3_push_csvs.py
│       ├── generate_showcase_push_csvs.py
│       └── generate_new_user_waterfall.py
```

### Proposed New System Structure

```
push-automation-engine/                   # NEW SEPARATE PROJECT
├── src/
│   ├── engine/
│   │   ├── AutomationEngine.ts           # Core orchestrator (adapted from existing)
│   │   ├── ExecutionPipeline.ts          # 5-phase execution
│   │   └── SchedulerService.ts           # BullMQ-based scheduler
│   │
│   ├── generators/                       # Replaces Python scripts
│   │   ├── base/
│   │   │   ├── BaseAudienceGenerator.ts  # Abstract base class
│   │   │   └── types.ts                  # Shared types
│   │   ├── layer2/
│   │   │   └── TrendingClosetGenerator.ts
│   │   ├── layer3/
│   │   │   └── BehaviorResponseGenerator.ts
│   │   ├── layer5/
│   │   │   └── NewUserWaterfallGenerator.ts
│   │   └── showcase/
│   │       └── ShowcaseGenerator.ts
│   │
│   ├── queries/                          # SQL queries (typed)
│   │   ├── trending.ts
│   │   ├── users.ts
│   │   ├── products.ts
│   │   └── wishlists.ts
│   │
│   ├── storage/
│   │   ├── AutomationStorage.ts          # Config persistence
│   │   └── ExecutionLogger.ts            # Execution logs
│   │
│   ├── delivery/
│   │   ├── PushDeliveryService.ts        # Firebase integration
│   │   └── CadenceService.ts             # Cadence filtering
│   │
│   ├── csv/
│   │   └── CsvGenerator.ts               # Streaming CSV generation
│   │
│   └── db/
│       └── pool.ts                       # Shared pg pool
│
├── tests/
│   ├── generators/
│   ├── integration/
│   └── fixtures/
│
└── package.json
```

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Automation     │────▶│  Audience       │────▶│  CSV            │
│  Engine         │     │  Generator      │     │  Generator      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │               ┌─────────────────┐             │
        │               │  PostgreSQL     │             │
        │               │  (pg Pool)      │             │
        │               └─────────────────┘             │
        │                                               │
        ▼                                               ▼
┌─────────────────┐                            ┌─────────────────┐
│  Cadence        │                            │  Firebase       │
│  Service        │◀───────────────────────────│  Push Delivery  │
└─────────────────┘                            └─────────────────┘
```

### Feature Flags / Config

| Config | Current | New System |
|--------|---------|------------|
| Lead time (test) | 3 minutes | 3 minutes |
| Lead time (real) | 30 minutes | 30 minutes |
| Cancellation window | 25 minutes | 25 minutes |
| Max batch size | 500 | 500 |
| Connection pool | 10 | 10 |

### Potential Blast Radius

- **High**: Push notification delivery (must preserve exact behavior)
- **Medium**: Execution timeline and phases (can adapt patterns)
- **Low**: Storage format (can redesign)
- **None**: Cadence service (unchanged)

---

## 4) Root Cause Analysis

*Not applicable - this is a new feature, not a bug fix.*

The motivation for this new system is documented in the companion ideation document: [Python DB Connectivity Problem](./python-db-connectivity-problem.md). Key issue: Python subprocess creates new database connections that get blocked by AWS RDS security groups when Railway's dynamic IPs change.

---

## 5) Research Findings

### Potential Solutions

#### A. Scheduler Library

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| **BullMQ** | Redis-backed persistence, native TS, retries, horizontal scaling | Requires Redis | **Recommended** for production |
| **node-cron** | Simple, no dependencies, existing familiarity | No persistence, no retries, single-instance | Good for MVP |
| **Agenda** | MongoDB-backed, feature-rich | Requires MongoDB | Overkill |
| **Bree** | Worker threads, no Redis | Less mature | Not recommended |

**Recommendation**: Start with `node-cron` (existing pattern) for MVP, migrate to `BullMQ` for production scaling.

#### B. Query Builder

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| **Kysely** | Type-safe, lightweight (~2MB), no codegen, SQL-like | Learning curve | **Recommended** |
| **Raw SQL** | Full control, no abstraction | No type safety | Good for complex queries |
| **Drizzle** | Modern, type-safe | Heavier, newer | Alternative |
| **Prisma** | Full ORM, migrations | Too heavy, abstracts too much | Not recommended |

**Recommendation**: Use **Kysely** for type-safe queries with the existing `pg` pool. Fall back to raw SQL for very complex queries (e.g., CTEs with multiple JOINs).

#### C. CSV Generation

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| **fast-csv** | Streaming, memory-efficient | Slightly verbose API | **Recommended** |
| **csv-writer** | Simple API | No streaming | Good for small datasets |
| **papaparse** | Browser + Node | Heavier | Not recommended |

**Recommendation**: Use **fast-csv** with streaming for memory-efficient CSV generation, especially for large audiences.

#### D. Architecture Pattern

**Strategy Pattern for Audience Generators**

```typescript
// Base interface
interface AudienceGenerator {
  readonly layerId: number;
  readonly name: string;
  generate(options: GeneratorOptions): Promise<AudienceResult>;
  validate(): Promise<boolean>;
}

// Concrete implementations
class TrendingClosetGenerator implements AudienceGenerator {
  readonly layerId = 2;
  readonly name = 'trending-closet';

  async generate(options: GeneratorOptions): Promise<AudienceResult> {
    const trending = await this.queries.getTrendingProducts(options.lookbackDays);
    const users = await this.queries.getUsersWithTrendingProducts(trending);
    const enriched = await this.enrichWithWishlistCounts(users);
    return this.generateCsv(enriched);
  }
}

// Registry for dynamic lookup
class GeneratorRegistry {
  private generators = new Map<string, AudienceGenerator>();

  register(generator: AudienceGenerator): void {
    this.generators.set(generator.name, generator);
  }

  get(name: string): AudienceGenerator | undefined {
    return this.generators.get(name);
  }
}
```

#### E. Type Safety

**Typed Query Results with Kysely + Zod**

```typescript
// Database types (Kysely)
interface Database {
  users: UsersTable;
  products: ProductsTable;
  product_variants: ProductVariantsTable;
  offers: OffersTable;
}

// Runtime validation (Zod)
const TrendingProductSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string(),
  offer_count: z.number(),
  rank_number: z.number(),
});

type TrendingProduct = z.infer<typeof TrendingProductSchema>;

// Query with type safety
async function getTrendingProducts(days: number): Promise<TrendingProduct[]> {
  const results = await db
    .selectFrom('offers')
    .innerJoin('products', 'products.id', 'offers.product_id')
    .select(['products.id as product_id', 'products.name as product_name'])
    .groupBy(['products.id', 'products.name'])
    .orderBy(db.fn.count('offers.id'), 'desc')
    .limit(10)
    .execute();

  return results.map(r => TrendingProductSchema.parse(r));
}
```

### Technology Stack Recommendation

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js 20+ | Existing infrastructure |
| Language | TypeScript 5.x | Type safety, existing codebase |
| Scheduler | node-cron (MVP) → BullMQ (prod) | Familiar pattern, production scaling |
| Database | pg + Kysely | Type-safe queries with existing pool |
| CSV | fast-csv (streaming) | Memory-efficient for large audiences |
| Validation | Zod | Runtime type validation |
| Testing | Jest + ts-jest | Existing testing infrastructure |
| DI | Manual/tsyringe | Testability |

---

## 6) Architecture Comparison

### Option 1: Embedded in Push-Blaster (Recommended)

Create new modules within the existing `push-blaster` service.

```
services/push-blaster/
├── src/
│   ├── lib/
│   │   ├── automationEngine.ts      # Existing (unchanged initially)
│   │   ├── automationEngineV2.ts    # New TypeScript engine
│   │   └── generators/              # New audience generators
│   │       ├── index.ts
│   │       ├── TrendingClosetGenerator.ts
│   │       └── ...
```

**Pros**:
- Shares existing infrastructure (db pool, Firebase, cadence integration)
- Gradual migration path
- Single deployment unit
- No new service to manage

**Cons**:
- Larger service footprint
- Must coexist with Python scripts during migration

### Option 2: Separate Microservice

Create a new standalone service for automation orchestration.

```
services/
├── push-blaster/           # Existing (push delivery only)
├── push-cadence-service/   # Existing (cadence rules)
└── push-automation/        # New (automation orchestration)
```

**Pros**:
- Clean separation
- Independent scaling
- Independent deployment

**Cons**:
- New service to manage
- Cross-service communication complexity
- Duplicate infrastructure code

### Option 3: Monorepo Shared Package

Create shared packages for generators with consumption by push-blaster.

```
packages/
├── audience-generators/    # Shared generator logic
├── push-queries/           # Shared database queries
└── push-types/             # Shared TypeScript types

services/
└── push-blaster/           # Consumes packages
```

**Pros**:
- Maximum code reuse
- Clear boundaries
- Testable in isolation

**Cons**:
- More complex build setup
- Learning curve for monorepo tooling

### Recommendation

**Option 1: Embedded in Push-Blaster** is recommended for the following reasons:
1. Simplest migration path
2. Reuses existing working infrastructure
3. Single deployment (already on Railway)
4. Can evolve to Option 3 later if needed

---

## 7) Migration Strategy

### Phase 1: Foundation (Week 1)

1. **Create generator base classes**
   - `BaseAudienceGenerator` abstract class
   - `GeneratorResult` type definitions
   - CSV streaming utilities

2. **Create query modules**
   - Port Python SQL queries to TypeScript
   - Add Kysely type definitions
   - Add Zod validation schemas

3. **Create `AutomationEngineV2`**
   - Copy patterns from existing engine
   - Replace `scriptExecutor` with generator calls
   - Add feature flag to switch between V1/V2

### Phase 2: Generator Implementation (Week 2)

4. **Implement Layer 2 Generator** (highest priority)
   - `TrendingClosetGenerator`
   - Port all SQL queries
   - Implement CSV generation
   - Test with founder user ID

5. **Implement Layer 3 Generator**
   - `BehaviorResponseGenerator`
   - Port recent offer/closet/wishlist queries

6. **Implement Layer 5 Generator**
   - `NewUserWaterfallGenerator`
   - Port waterfall extraction logic
   - Implement mutually exclusive audience logic

### Phase 3: Integration & Testing (Week 3)

7. **Integration with existing pipeline**
   - Hook into test automation API
   - Hook into live execution API
   - Verify cadence service integration

8. **Parallel testing**
   - Run V1 and V2 side-by-side
   - Compare CSV outputs
   - Verify audience sizes match

### Phase 4: Cutover (Week 4)

9. **Gradual rollout**
   - Enable V2 for test automations first
   - Monitor execution logs
   - Enable V2 for production automations

10. **Cleanup**
    - Remove Python scripts
    - Remove scriptExecutor
    - Update Docker image (remove Python)

---

## 8) Clarifications Needed

Before proceeding with implementation, please clarify:

### Q1: Project Structure

- [ ] **Option A**: Embedded in push-blaster (recommended)
- [ ] **Option B**: Separate microservice
- [ ] **Option C**: Monorepo shared packages
- [ ] **Other**: Specify preference

### Q2: Scheduler Choice

- [ ] **Keep node-cron**: Simpler, existing pattern, no Redis needed
- [ ] **Use BullMQ**: More robust, requires Redis, better for production
- [ ] **Other**: Specify preference

### Q3: Query Approach

- [ ] **Kysely**: Type-safe query builder
- [ ] **Raw SQL**: Maximum control, port queries directly
- [ ] **Hybrid**: Kysely for simple queries, raw SQL for complex ones (recommended)
- [ ] **Other**: Specify preference

### Q4: Migration Priority

Which generator should be implemented first?

- [ ] **Layer 2** (Trending Closet) - most business impact
- [ ] **Layer 5** (New User Waterfall) - most complex, good test case
- [ ] **Layer 3** (Behavior Response) - simplest queries
- [ ] **All simultaneously** - parallel development

### Q5: Test Data Strategy

- [ ] **Use founder test user**: Single known user for all tests
- [ ] **Create test dataset**: Seed data for comprehensive testing
- [ ] **Use production data**: Test against real data with safeguards
- [ ] **Other**: Specify preference

### Q6: Deployment Approach

- [ ] **Feature flag**: V1 vs V2 toggle at runtime
- [ ] **Gradual rollout**: Enable per-automation
- [ ] **Big bang**: Replace all at once after testing
- [ ] **Other**: Specify preference

---

## 9) Next Steps

Once clarifications are provided:

1. Create a detailed implementation spec (`/spec:create`)
2. Set up the generator base classes and types
3. Port the first generator (based on priority)
4. Implement parallel testing infrastructure
5. Begin phased migration

---

## Appendix A: Python Script Analysis

### Scripts to Port

| Script | Complexity | Queries | Outputs |
|--------|------------|---------|---------|
| `generate_layer_2_push_csv.py` | High | 6+ queries, CTEs, aggregations | 2 CSVs (main, top1) + 2 test CSVs |
| `generate_layer_3_push_csvs.py` | Medium | 3 queries, time-based filters | 3 CSVs + 3 test CSVs |
| `generate_showcase_push_csvs.py` | Medium | Product-focused queries | 3 CSVs + 3 test CSVs |
| `generate_new_user_waterfall.py` | High | 5-level waterfall, exclusion logic | 5 CSVs + 5 test CSVs |

### Query Complexity Examples

**Layer 2 - Trending Products Query**:
```sql
WITH ranked_offers AS (
  SELECT
    p.id as product_id,
    p.name as product_name,
    COUNT(DISTINCT o.id) as offer_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT o.id) DESC) as rank_number
  FROM offers o
  JOIN offer_items oi ON o.id = oi.offer_id
  JOIN product_variants pv ON oi.product_variant_id = pv.id
  JOIN products p ON pv.product_id = p.id
  WHERE o.created_at >= NOW() - INTERVAL '7 days'
  GROUP BY p.id, p.name
  ORDER BY offer_count DESC
  LIMIT 10
)
SELECT *,
  CASE rank_number
    WHEN 1 THEN '1st'
    WHEN 2 THEN '2nd'
    WHEN 3 THEN '3rd'
    ELSE rank_number || 'th'
  END as trending_rank
FROM ranked_offers;
```

**Layer 5 - Waterfall Extraction Pattern**:
```typescript
// Pseudocode for waterfall logic
const allNewUsers = await getNewUsersInWindow(12, 14);

// Level 1: No Shoes
const noShoesUsers = allNewUsers.filter(u => !hasClosetItems(u));
const remainingAfterL1 = allNewUsers.filter(u => hasClosetItems(u));

// Level 2: No Bio (from remaining)
const noBioUsers = remainingAfterL1.filter(u => !hasBio(u));
const remainingAfterL2 = remainingAfterL1.filter(u => hasBio(u));

// ... continues for 5 levels
```

---

## Appendix B: Existing Engine Patterns to Preserve

### 5-Phase Execution Pipeline

```typescript
// Phase 1: Audience Generation (T-30)
await executeAudienceGeneration(automation, config);

// Phase 2: Test Push Sending (T-25)
await executeTestSending(automation, config);

// Phase 3: Cancellation Window (T-25 to T-0)
await executeCancellationWindow(automation, config);

// Phase 4: Live Execution (T-0)
await executeLiveSending(automation, config);

// Phase 5: Cleanup
await executeCleanup(automation, config);
```

### Execution Locking

```typescript
// Prevent duplicate executions
if (this.isExecutionActive(automationId)) {
  console.log(`Execution already active, skipping`);
  return;
}

// Track active execution
this.activeExecutions.set(automationId, {
  startTime: new Date(),
  currentPhase: 'starting',
  abortController: new AbortController()
});
```

### Process Cleanup

```typescript
// Destroy all cron jobs on shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('exit', cleanup);
```

---

## Appendix C: Example TypeScript Generator

```typescript
// src/lib/generators/TrendingClosetGenerator.ts

import { Pool } from 'pg';
import { createWriteStream } from 'fs';
import { format as csvFormat } from 'fast-csv';
import { z } from 'zod';

// Types
const TrendingProductSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string(),
  offer_count: z.number(),
  rank_number: z.number(),
  trending_rank: z.string(),
});

type TrendingProduct = z.infer<typeof TrendingProductSchema>;

interface GeneratorOptions {
  lookbackDays: number;
  activityDays: number;
  outputDir: string;
  dryRun: boolean;
}

interface GeneratorResult {
  success: boolean;
  csvFiles: string[];
  audienceSize: number;
  error?: string;
}

// Generator Implementation
export class TrendingClosetGenerator {
  constructor(private pool: Pool) {}

  async generate(options: GeneratorOptions): Promise<GeneratorResult> {
    const { lookbackDays, activityDays, outputDir, dryRun } = options;

    // Step 1: Get trending products
    const trending = await this.getTrendingProducts(lookbackDays);
    if (!trending.length) {
      return { success: false, csvFiles: [], audienceSize: 0, error: 'No trending products found' };
    }

    // Step 2: Get users with trending products
    const productIds = trending.map(p => p.product_id);
    const users = await this.getUsersWithTrendingProducts(productIds, activityDays);

    // Step 3: Match to highest-ranked product
    const matched = this.matchUsersToHighestRanked(users, trending);

    // Step 4: Enrich with wishlist counts
    const enriched = await this.enrichWithWishlistCounts(matched);

    // Step 5: Apply demand filtering
    const filtered = enriched.filter(u => u.variant_open_offers >= 2);

    if (dryRun) {
      return { success: true, csvFiles: [], audienceSize: filtered.length };
    }

    // Step 6: Generate CSV files
    const csvFiles = await this.generateCsvFiles(filtered, outputDir);

    return { success: true, csvFiles, audienceSize: filtered.length };
  }

  private async getTrendingProducts(lookbackDays: number): Promise<TrendingProduct[]> {
    const result = await this.pool.query(`
      WITH ranked_offers AS (
        SELECT
          p.id as product_id,
          p.name as product_name,
          COUNT(DISTINCT o.id) as offer_count,
          ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT o.id) DESC) as rank_number
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        JOIN product_variants pv ON oi.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE o.created_at >= NOW() - INTERVAL '${lookbackDays} days'
        GROUP BY p.id, p.name
        ORDER BY offer_count DESC
        LIMIT 10
      )
      SELECT *,
        CASE rank_number
          WHEN 1 THEN '1st'
          WHEN 2 THEN '2nd'
          WHEN 3 THEN '3rd'
          ELSE rank_number || 'th'
        END as trending_rank
      FROM ranked_offers
    `);

    return result.rows.map(row => TrendingProductSchema.parse(row));
  }

  // ... additional methods
}
```
