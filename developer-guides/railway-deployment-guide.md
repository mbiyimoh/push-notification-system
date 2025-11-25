# Railway Deployment Guide: Push Notification System

## Overview

This guide provides comprehensive documentation for deploying the Push Notification System to Railway. The system consists of two Node.js/Next.js services that share a monorepo structure and require external database connections.

**Quick Facts:**
- Deployment Platform: Railway
- Build Method: Docker multi-stage builds
- Services: 2 (push-blaster + push-cadence-service)
- External Dependencies: AWS RDS + Neon PostgreSQL + Firebase
- Domain: `https://push-notification-system-production.up.railway.app`

---

## 1. Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Railway Platform                        │
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────┐      │
│  │  push-blaster        │         │ push-cadence-service │      │
│  │  (Port: $PORT)       │         │ (Port: $PORT)        │      │
│  │                      │         │                      │      │
│  │ - Next.js app       │         │ - Next.js app       │      │
│  │ - Health: /api/...  │         │ - Health: /api/...  │      │
│  │ - Fire notifications│         │ - Schedule cadence  │      │
│  │                     │◄───────►│ - Automation rules  │      │
│  │ Dockerfile          │         │                     │      │
│  │ railway.toml        │         │ Dockerfile.cadence  │      │
│  │                     │         │ railway.cadence...  │      │
│  └──────────────────────┘         └──────────────────────┘      │
│         ▲                                   ▲                    │
│         │ CADENCE_SERVICE_URL              │                    │
│         └───────────────────────────────────┘                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         ▲                                                  ▲
         │                                                  │
         │ DATABASE_URL                                    │
         │ PUSH_CADENCE_DATABASE_URL                       │
         │ FIREBASE_* env vars                             │
         │                                                  │
    ┌────┴────────────────┐                    ┌───────────┴────┐
    │  AWS RDS PostgreSQL │                    │  Neon Database │
    │  (Main Tradeblock)  │                    │  (Push Records)│
    └─────────────────────┘                    └────────────────┘
```

### Monorepo Structure

```
push-notification-system/
├── Dockerfile                    # Builds push-blaster service
├── Dockerfile.cadence            # Builds push-cadence-service
├── railway.toml                  # Railway config for push-blaster
├── railway.cadence.toml          # Railway config for push-cadence-service
├── env.example                   # Environment variable template
├── CLAUDE.md                      # Project documentation
│
├── services/
│   ├── push-blaster/
│   │   ├── package.json          # Main service dependencies
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   └── api/
│   │   │   │       ├── health/        # GET /api/health healthcheck
│   │   │   │       ├── automation/    # Automation endpoints
│   │   │   │       └── push/          # Push notification endpoints
│   │   │   └── lib/
│   │   │       ├── automationEngine.ts    # Startup restoration logic
│   │   │       ├── db.ts                  # Database connection pool
│   │   │       └── firebase-admin.ts      # Firebase configuration
│   │   └── public/
│   │
│   └── push-cadence-service/
│       ├── package.json          # Cadence service dependencies
│       ├── src/
│       │   ├── app/
│       │   │   └── api/
│       │   │       ├── health/        # GET /api/health healthcheck
│       │   │       └── cadence/       # Cadence management endpoints
│       │   └── lib/
│       │       └── db.ts              # Cadence database pool
│       ├── db/                        # Migration scripts
│       └── scripts/
│           └── run-migration.js       # Post-install migration
│
└── shared/
    └── (Shared utilities if any)
```

---

## 2. Dependencies & Key Files

### Docker Build Configuration

#### **Dockerfile** (push-blaster service)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the push-blaster service
COPY services/push-blaster/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY services/push-blaster/ ./

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:railway"]
```

**Key Points:**
- Multi-stage build optimizes image size
- Only copies `services/push-blaster/` from the monorepo
- Uses Node 20 Alpine for minimal footprint
- Runs `start:railway` which uses `$PORT` environment variable

#### **Dockerfile.cadence** (push-cadence-service)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the push-cadence-service
COPY services/push-cadence-service/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY services/push-cadence-service/ ./

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Copy migration scripts (needed for postinstall)
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:railway"]
```

**Differences from Dockerfile:**
- Builds `services/push-cadence-service/` instead
- Copies `db/` and `scripts/` directories for migrations
- Supports database initialization on startup

### Railway Configuration Files

#### **railway.toml** (push-blaster)

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

**Configuration Details:**
- Uses root `Dockerfile` (not `Dockerfile.cadence`)
- Restarts on failure up to 10 times
- No healthcheck configured (uses auto-restart instead)

#### **railway.cadence.toml** (push-cadence-service)

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.cadence"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[deploy.healthcheck]
initialDelaySeconds = 10
```

**Configuration Details:**
- Uses `Dockerfile.cadence` for building
- **Healthcheck enabled**: Queries `/api/health` endpoint
- 300-second timeout for healthcheck (handles slow DB connections)
- 10-second delay before first healthcheck
- Restarts on failure up to 10 times

### Environment Variables Required

Create these in Railway deployment settings:

```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:PASSWORD@production-database.cluster-xxxxx.us-east-1.rds.amazonaws.com:5432/main?sslmode=require
PUSH_CADENCE_DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require

# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Inter-service Communication
CADENCE_SERVICE_URL=https://your-cadence-service-url.up.railway.app

# Node Configuration
NODE_ENV=production
```

**Environment Variable Details:**

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Main Tradeblock DB connection | AWS RDS endpoint (NOT private hostname) |
| `PUSH_CADENCE_DATABASE_URL` | Push records & cadence rules DB | Neon pooler endpoint |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | GCP project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | `firebase-adminsdk@...` |
| `FIREBASE_PRIVATE_KEY` | Firebase private key (multiline) | PEM format with escaped newlines |
| `CADENCE_SERVICE_URL` | URL to push-cadence-service | Railway service URL |
| `NODE_ENV` | Node environment | `production` |

---

## 3. Deployment Flow

### How Railway Builds from the Monorepo

```
1. Railway detects Dockerfile in root directory
   ↓
2. Reads Dockerfile (or Dockerfile.cadence)
   ↓
3. Context = entire repository root
   ↓
4. Dockerfile uses COPY services/push-blaster/ (or push-cadence-service/)
   ↓
5. Only specified service code is included in image
   ↓
6. Multi-stage build optimizes final image
   ↓
7. Image tagged and deployed as service
```

### Docker Multi-Stage Build Process

**Stage 1: Builder**
```
- Starts with node:20-alpine base
- Creates /app working directory
- Copies package.json & package-lock.json
- Runs npm ci (clean install)
- Copies all source code
- Runs npm run build (Next.js compilation)
- Outputs: /app/.next, /app/node_modules, etc.
```

**Stage 2: Runner**
```
- Fresh node:20-alpine instance
- Copies only built artifacts from Stage 1
- No source code, no build tools
- ~30-40% smaller final image
- Runs next start --port $PORT
- Exposes port 3000
```

**Benefits:**
- Smaller deployment size
- No source code in production image
- Faster startup after build
- Secure (no build tools in production)

### Service Startup Sequence

#### push-blaster Startup

```
1. Railway creates container from image
   ↓
2. ENV NODE_ENV=production
   ↓
3. CMD: npm run start:railway
   ├─ Next.js server initializes (port from $PORT env)
   ├─ Connects to DATABASE_URL
   ├─ AutomationEngine initializes
   │  ├─ Performs startup restoration
   │  ├─ Queries all active automations
   │  ├─ Restores scheduled jobs
   │  └─ Logs restoration status
   └─ Ready to accept requests

4. Railway test /api/health
   ├─ Returns 200 always (even if degraded)
   ├─ Details in response body
   └─ Service marked as healthy
```

#### push-cadence-service Startup

```
1. Railway creates container from image
   ↓
2. ENV NODE_ENV=production
   ↓
3. npm postinstall hook
   ├─ Runs scripts/run-migration.js
   ├─ Creates/updates cadence database schema
   └─ Continues even if migration fails
   ↓
4. CMD: npm run start:railway
   ├─ Next.js server initializes (port from $PORT env)
   ├─ Connects to PUSH_CADENCE_DATABASE_URL
   ├─ Loads cadence rules
   └─ Ready to accept requests
   ↓
5. Railway test /api/health
   ├─ Queries PUSH_CADENCE_DATABASE_URL
   ├─ Returns 200 if healthy, 503 if degraded
   └─ Healthcheck determines service status
```

---

## 4. File & Code Mapping

### Build Process: Dockerfile Mapping

**What Gets Built:**

| File | Purpose | Included in Image |
|------|---------|-------------------|
| `Dockerfile` | Build config | No (not copied) |
| `services/push-blaster/` | Application code | Yes |
| `services/push-blaster/package.json` | Dependencies | Yes (resolved) |
| `services/push-blaster/src/` | Source code | Yes (compiled) |
| `.next/` | Compiled app | Yes |
| `public/` | Static assets | Yes |
| `node_modules/` | Installed packages | Yes |

### Health Endpoints Mapping

#### **push-blaster Health Endpoint**

**File:** `/Users/AstroLab/Desktop/code-projects/push-notification-system/services/push-blaster/src/app/api/health/route.ts`

```typescript
GET /api/health

Response (200 always):
{
  "status": "healthy" | "degraded" | "critical",
  "service": "push-blaster",
  "timestamp": "2024-11-24T12:00:00Z",
  "uptime": 3600,
  "automationEngine": {
    "scheduledJobsCount": 5,
    "expectedJobsCount": 5,
    "divergence": 0,
    "lastRestorationAttempt": "2024-11-24T11:00:00Z",
    "restorationSuccess": true,
    "activeExecutionsCount": 0,
    "instanceId": "engine-1234567890-abcde"
  },
  "dependencies": {
    "database": "connected",
    "cadence": "healthy"
  },
  "memoryUsage": { ... },
  "responseTimeMs": "45.23"
}
```

**Key Characteristics:**
- Always returns HTTP 200 (Railway doesn't fail on non-2xx)
- Includes detailed health information in body
- Checks AutomationEngine restoration status
- Verifies database connectivity
- Tests cadence service communication
- Monitors memory usage

#### **push-cadence-service Health Endpoint**

**File:** `/Users/AstroLab/Desktop/code-projects/push-notification-system/services/push-cadence-service/src/app/api/health/route.ts`

```typescript
GET /api/health

Response (200 if healthy, 503 if degraded):
{
  "status": "healthy" | "degraded",
  "service": "push-cadence",
  "timestamp": "2024-11-24T12:00:00Z",
  "database": "connected" | "error" | "not_configured",
  "message": "Service running", // if degraded
  "error": "Connection refused", // if error
  "memoryUsage": { ... }
}
```

**Key Characteristics:**
- Returns HTTP 503 if database is unavailable
- Returns HTTP 200 if healthy
- Railway healthcheck configured to validate status
- Timeout: 300 seconds (handles slow connections)

### Package.json Script Mapping

#### **push-blaster Scripts**

```json
{
  "scripts": {
    "dev": "concurrently ... npm run dev:push-only npm run dev:cadence",
    "dev:push-only": "dotenv -e ../../.env -- next dev -p 3001",
    "dev:cadence": "cd ../push-cadence-service && npm run dev",
    "build": "next build",
    "start:railway": "next start --port $PORT",
    "start:prod": "concurrently npm:start npm:start:cadence"
  }
}
```

**Why Each Script:**
- `start:railway`: Used in production, respects `$PORT` env
- `start:prod`: For local production testing
- `dev`: Runs both services concurrently

#### **push-cadence-service Scripts**

```json
{
  "scripts": {
    "dev": "dotenv -e ../../.env -- next dev -p 3002",
    "build": "next build",
    "start:railway": "next start --port $PORT",
    "migrate": "node scripts/run-migration.js",
    "postinstall": "npm run migrate || echo 'Migration failed...'"
  }
}
```

**Critical Script:**
- `postinstall`: Auto-runs after npm ci during Docker build
- Creates/updates database schema on deployment
- Continues even if migration fails (non-blocking)

---

## 5. Critical Notes & Pitfalls

### 5.1 Monorepo Deployment Challenges

**Problem:** Dockerfile must include entire monorepo context but only deploy one service.

**Solution:**
```dockerfile
# Only copies the specific service
COPY services/push-blaster/package*.json ./
COPY services/push-blaster/ ./
```

**Common Mistake:**
```dockerfile
# DON'T do this - copies entire monorepo
COPY . .
```

**Best Practice:**
- Each service has its own Dockerfile
- Root directory has both: `Dockerfile` and `Dockerfile.cadence`
- Railway config specifies which Dockerfile to use

### 5.2 Healthcheck Configuration

#### Why push-blaster Has NO Healthcheck

**Configuration in railway.toml:**
```toml
[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
# No healthcheckPath configured
```

**Reasons:**
1. **AutomationEngine Startup Time**: Restoration of scheduled jobs can take time
2. **Graceful Degradation**: Service responds 200 even while initializing
3. **Detailed Health in Response Body**: Clients can check detailed status
4. **Restart Policy**: Handles crashes via restart, not healthcheck

**Endpoint Still Exists:**
- `GET /api/health` available for manual monitoring
- Always returns 200 to indicate process is alive
- Body contains detailed status information

#### Why push-cadence-service HAS Healthcheck

**Configuration in railway.cadence.toml:**
```toml
[deploy.healthcheck]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
initialDelaySeconds = 10
```

**Reasons:**
1. **Database Requirement**: Service is unusable without database
2. **Clear Failure Indicator**: Returns 503 if database unavailable
3. **Railway Auto-Recovery**: Restarts service if unhealthy
4. **Slower Startup**: 10-second delay allows for database initialization

### 5.3 Database Connection from Railway (RDS Security Groups)

**Critical Issue:** AWS RDS requires inbound rules for Railway IP ranges.

**Configuration Required:**
```
AWS RDS Security Group → Inbound Rules
├─ Type: PostgreSQL (5432)
├─ Source: Railway Static IP ranges (or specific IP)
└─ Description: "Railway deployment access"
```

**Important Note from env.example:**
```
# IMPORTANT: Use the RDS endpoint, NOT private hostnames
CORRECT: production-database.cluster-cseupqwlh6at.us-east-1.rds.amazonaws.com
WRONG:   production.database.primary (private hostname, won't resolve)
```

**Why RDS Endpoint Matters:**
- Private hostname only resolves within VPC
- Railway runs outside VPC
- Must use publicly resolvable RDS endpoint
- Use RDS cluster endpoint, not individual instance endpoint

**Testing Connection:**
```bash
# In Railway container shell:
psql -h production-database.cluster-cseupqwlh6at.us-east-1.rds.amazonaws.com \
     -U postgres \
     -d main \
     -c "SELECT 1;"
```

### 5.4 CADENCE_SERVICE_URL Configuration Between Services

**Push-blaster calls push-cadence-service:**
```typescript
// services/push-blaster/src/app/api/health/route.ts
if (process.env.CADENCE_SERVICE_URL) {
  const cadenceResponse = await fetch(
    `${process.env.CADENCE_SERVICE_URL}/api/health`
  );
  health.dependencies.cadence = cadenceResponse.ok ? 'healthy' : 'degraded';
}
```

**Configuration in Railway:**

| Service | CADENCE_SERVICE_URL |
|---------|-------------------|
| push-blaster | `https://your-cadence-service-prod.up.railway.app` |
| push-cadence-service | (not set - it doesn't call anything) |

**Important Points:**
- Must be FULL URL with `https://`
- Must be public Railway service URL
- Services communicate over HTTPS
- Set with 5-second timeout in health check
- Missing/wrong URL logs warning but doesn't fail service

### 5.5 Using Correct Dockerfile for Each Service

**Critical Configuration:**

push-blaster deployment:
```toml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"  # ← Correct file
```

push-cadence-service deployment:
```toml
# railway.cadence.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.cadence"  # ← Correct file
```

**Common Mistake:** Using `Dockerfile` for both services
- Results in wrong application code being deployed
- Cadence service gets push-blaster code (missing migrations)
- Push-blaster gets unnecessary migration scripts

---

## 6. Common Development Scenarios

### 6.1 Deploying Updates

**Scenario:** You've made code changes and want to deploy to production.

**Steps:**

1. **Commit changes to git:**
   ```bash
   git add services/push-blaster/src/
   git commit -m "Update notification filtering logic"
   git push origin master
   ```

2. **Deploy via Railway CLI:**
   ```bash
   railway up --detach
   ```

   This triggers:
   - Railway pulls latest code from git
   - Builds Dockerfile from repository
   - Creates new container
   - Replaces running service
   - Health check validates deployment

3. **Monitor deployment:**
   ```bash
   railway logs    # View service logs
   railway status  # Check service status
   ```

4. **Verify:**
   ```bash
   curl https://push-notification-system-production.up.railway.app/api/health
   ```

**Alternative: Using Environment Variables**

If only env vars changed:
1. Update in Railway dashboard
2. Railway automatically redeploys from git
3. New container created with new env vars
4. No code changes needed

### 6.2 Adding Environment Variables

**Via Railway CLI:**

```bash
# Add variable
railway variable add FIREBASE_PROJECT_ID "new-project-id"

# List all variables
railway variables

# Remove variable
railway variable remove FIREBASE_PROJECT_ID
```

**Via Railway Web Dashboard:**
1. Navigate to project settings
2. Click "Variables"
3. Add new key-value pair
4. Click "Save"
5. Railway triggers automatic redeploy

**Important:** Railway redeploy after env var change uses Git repository, not Docker. To ensure Dockerfile is used:
- Make dummy commit: `git commit --allow-empty -m "Trigger Railway rebuild"`
- Push: `git push origin master`
- Or use: `railway up --detach`

### 6.3 Debugging Deployment Failures

**Scenario:** Service deployed but not responding.

**Step 1: Check Rails Logs**
```bash
railway logs -f    # Follow logs
railway logs -n 100 # Last 100 lines
```

**Common Log Messages:**

| Message | Meaning | Action |
|---------|---------|--------|
| `Error: Cannot find module` | Missing dependency | Check package.json, rebuild |
| `ECONNREFUSED: 5432` | Database connection failed | Check DATABASE_URL, RDS security group |
| `ENOTFOUND: cadence-service` | CADENCE_SERVICE_URL wrong | Update environment variable |
| `yarn/npm not found` | Node tools missing | Check Node version, npm ci commands |
| `Migration failed` | Database schema issue | Check PUSH_CADENCE_DATABASE_URL |

**Step 2: SSH into Container**
```bash
railway shell
```

Inside container:
```bash
# Check environment variables
env | grep DATABASE_URL
env | grep FIREBASE_

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check if port is listening
netstat -tlnp | grep 3000

# View application logs
cat /app/.next/logs/*  # if logs are written
```

**Step 3: View Deployment Status**
```bash
railway deployments    # List recent deployments
railway logs --deployment=<id>  # Logs for specific deployment
```

### 6.4 Viewing Logs

**Real-time logs:**
```bash
railway logs -f
```

**Last N lines:**
```bash
railway logs -n 50
```

**Filter logs:**
```bash
railway logs -f | grep "ERROR\|WARN"
```

**Historic logs (Railway dashboard):**
1. Open Railway web dashboard
2. Select project and service
3. Click "Logs" tab
4. Set date range
5. Search/filter by text

**Common Log Patterns:**

```log
# Healthy startup:
├─ AutomationEngine initialized
├─ Startup restoration: expected 5, scheduled 5, divergence 0
├─ Next.js server started on port 3001
└─ Service ready for requests

# Database connection issue:
├─ [ERROR] Database connection failed
├─ ECONNREFUSED production-database.cluster-xxx.rds.amazonaws.com:5432
└─ Health status: degraded

# Migration issue:
├─ Running postinstall: npm run migrate
├─ [ERROR] Migration script failed
├─ But continuing (non-blocking)
└─ Service started anyway
```

### 6.5 Rolling Back Deployments

**Option 1: Redeploy Previous Commit**

```bash
# View deployment history
railway deployments

# Find working deployment
# Note the commit hash

git checkout <working-commit-hash>
git push -f origin master  # Force push to trigger rebuild
railway up --detach        # Deploy
```

**Option 2: Revert Commit and Deploy**

```bash
git revert HEAD           # Create new commit that undoes changes
git push origin master    # Push
railway up --detach       # Deploy reverted code
```

**Option 3: From Railway Dashboard**

1. Go to Deployments tab
2. Find previous working deployment
3. Click "Redeploy" button
4. Railway rebuilds from that commit

**What Happens During Rollback:**

```
1. Railway stops current container
2. Builds Dockerfile from previous commit
3. Creates new container with old code
4. Runs health checks
5. If healthy, routes traffic to new container
6. If unhealthy, reverts and keeps old version
```

---

## 7. Troubleshooting Guide

### 7.1 Healthcheck Timeout Issues

**Symptom:** Service repeatedly fails healthcheck and restarts.

```log
ERROR: Healthcheck timeout - no response after 300s
Service restarting...
```

**Causes & Solutions:**

| Cause | Symptom | Solution |
|-------|---------|----------|
| Slow database | Health endpoint times out during DB query | Increase `healthcheckTimeout` in railway.toml, check RDS performance |
| Network lag | Requests taking >300s | Reduce timeout, check networking, use RDS reader endpoint |
| Hanging query | Database locks health endpoint | Kill long queries: `SELECT pg_terminate_backend(pid) FROM ...` |
| Service crash | Health endpoint unreachable | Check logs: `railway logs -f` |

**For push-cadence-service:**
```toml
# Current configuration
[deploy.healthcheck]
healthcheckTimeout = 300      # 5 minutes (very generous)
initialDelaySeconds = 10      # Wait before first check
```

**If still timing out:**
```toml
[deploy.healthcheck]
healthcheckTimeout = 600      # 10 minutes (if DB is very slow)
initialDelaySeconds = 30      # Wait longer for startup
```

### 7.2 Database Connection Failures

**Symptom:**
```log
Error: ECONNREFUSED at production-database.cluster-xxx.rds.amazonaws.com:5432
```

**Troubleshooting Checklist:**

1. **Verify DATABASE_URL Format**
   ```bash
   railway variable get DATABASE_URL
   # Should be: postgresql://user:pass@host:5432/dbname?sslmode=require
   ```

2. **Check RDS Endpoint is Public**
   ```bash
   # In Railway container:
   railway shell
   nslookup production-database.cluster-xxx.rds.amazonaws.com
   # Should resolve to IP address
   ```

3. **Verify RDS Security Group**
   ```
   AWS Console → RDS → Security Groups
   ├─ Inbound rule for PostgreSQL (5432)
   ├─ Source: 0.0.0.0/0 (OR Railway static IP)
   └─ Status: Authorized
   ```

4. **Test Connection from Railway Container**
   ```bash
   railway shell
   psql "postgresql://user:pass@host:5432/dbname?sslmode=require" -c "SELECT 1;"
   ```

5. **Check if RDS is Actually Running**
   ```
   AWS Console → RDS Instances
   └─ Status should be "available" (not "creating" or "deleting")
   ```

6. **If Using Private Hostname (WRONG):**
   ```bash
   # This will NOT work from Railway:
   DATABASE_URL=postgresql://user:pass@production.database.primary:5432/main
   
   # Must use cluster endpoint:
   DATABASE_URL=postgresql://user:pass@production-database.cluster-xxx.us-east-1.rds.amazonaws.com:5432/main
   ```

### 7.3 Build Failures

**Symptom:** Deployment fails during build phase.

```log
ERROR: Build failed
Step 3/15 : RUN npm ci
error: code ERESOLVE, npm ERR! ...
```

**Common Build Errors & Solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| `ERESOLVE` | Conflicting dependencies | Update package.json, use npm 8.x, check Node version |
| `Cannot find module` | Missing import/file | Check import paths, ensure file exists |
| `npm ERR! 404` | Package not found in registry | Check package name spelling, verify npm registry access |
| `ENOMEM` | Out of memory during build | Railway containers have 512MB RAM by default; increase plan |
| `build: next build` fails | TypeScript errors | Run locally: `npm run build`, fix errors |

**Debug Build Failures:**

1. **Build locally first:**
   ```bash
   cd services/push-blaster
   npm ci
   npm run build
   # If this works, Railway should too
   ```

2. **Check Docker build locally:**
   ```bash
   docker build -f Dockerfile -t test-image .
   # Run through build process locally
   ```

3. **View full build logs:**
   ```bash
   railway logs --deployment=<id> | head -200
   ```

### 7.4 Service-to-Service Communication

**Symptom:** push-blaster health endpoint shows cadence service as unreachable.

```json
{
  "status": "degraded",
  "dependencies": {
    "cadence": "unreachable"  // ← Problem
  }
}
```

**Troubleshooting:**

1. **Verify CADENCE_SERVICE_URL is set:**
   ```bash
   railway variable get CADENCE_SERVICE_URL
   # Should output: https://your-cadence-service-prod.up.railway.app
   ```

2. **Test URL directly:**
   ```bash
   curl https://your-cadence-service-prod.up.railway.app/api/health
   # Should return 200 or 503 with valid JSON
   ```

3. **Check if cadence service is running:**
   ```bash
   railway project switch cadence-service
   railway logs -f
   # Check if it's receiving requests
   ```

4. **Verify URL syntax:**
   ```bash
   # Correct:
   https://your-service.up.railway.app
   
   # Wrong:
   http://your-service.up.railway.app  # Not HTTPS
   your-service.up.railway.app          # Missing protocol
   localhost:3002                        # Local reference
   ```

5. **If both services are healthy but unreachable:**
   - Check Railway networking settings
   - Ensure both services have "Public URL" enabled
   - Services communicate via public HTTPS, not internal network

---

## 8. Quick Reference

### Railway CLI Commands

```bash
# Project Management
railway project list          # List all projects
railway project switch <id>   # Switch to different project
railway init                  # Initialize new project

# Deployment
railway up --detach           # Deploy from local Dockerfile
railway status                # Check current deployment status
railway deployments           # List deployment history

# Environment
railway variable list         # List all env variables
railway variable add KEY VAL  # Add/update environment variable
railway variable remove KEY   # Remove environment variable

# Monitoring
railway logs -f               # Follow logs in real-time
railway logs -n 100           # Show last 100 lines
railway shell                 # SSH into running container
railway ps                    # List running services

# Scaling & Configuration
railway scale <cpu> <memory>  # Scale service resources
railway domain list           # List assigned domains
```

### Service URLs

```
push-blaster:
  Domain: https://push-notification-system-production.up.railway.app
  Health: /api/health
  Push API: /api/push
  Automation: /api/automation

push-cadence-service:
  Domain: https://your-cadence-service-prod.up.railway.app
  Health: /api/health
  Cadence API: /api/cadence
```

### Environment Variable Checklist

```bash
# Required for Operation
□ DATABASE_URL
□ PUSH_CADENCE_DATABASE_URL
□ FIREBASE_PROJECT_ID
□ FIREBASE_CLIENT_EMAIL
□ FIREBASE_PRIVATE_KEY
□ CADENCE_SERVICE_URL (for push-blaster)
□ NODE_ENV=production

# Optional / Advanced
□ PORT (set automatically by Railway)
□ PYTHON_PATH (if using Python automation)
□ DEBUG (for verbose logging)
```

### Deployment Checklist

**Before Deploying:**
- [ ] All code changes committed to git
- [ ] Database migrations tested locally
- [ ] Environment variables updated in Railway dashboard
- [ ] RDS security group allows Railway IP
- [ ] Firebase credentials are current
- [ ] CADENCE_SERVICE_URL points to correct service

**During Deployment:**
- [ ] Monitor `railway logs -f` for errors
- [ ] Healthcheck endpoint responds with 200/503
- [ ] Service responds to requests
- [ ] Database queries complete successfully

**After Deployment:**
- [ ] Test /api/health endpoint manually
- [ ] Verify push notifications send
- [ ] Check automation engine restoration
- [ ] Monitor memory and CPU usage
- [ ] Review application logs for errors

### Common Issues Quick Reference

```
Service won't start
├─ Check: railway logs -f
├─ Check: NODE_ENV=production
├─ Check: DATABASE_URL connectivity
└─ Action: railway shell → test db connection

Healthcheck timeout
├─ Check: Database query performance
├─ Check: Network latency
├─ Action: Increase healthcheckTimeout in railway.toml
└─ Action: Optimize slow queries

Database connection refused
├─ Check: RDS endpoint (not private hostname)
├─ Check: RDS security group inbound rule
├─ Action: railway shell → test with psql
└─ Action: Add Railway IP to RDS whitelist

Service to service unreachable
├─ Check: CADENCE_SERVICE_URL environment variable
├─ Check: Service is using HTTPS, not HTTP
├─ Action: curl $CADENCE_SERVICE_URL/api/health
└─ Action: Verify service is publicly accessible
```

---

## 9. Advanced Deployment Topics

### Multi-Service Deployment Strategy

**When to use multiple services:**

1. **Independent Scaling**: Services handle different load
   ```
   push-blaster: high-volume push sends → scale to 3 instances
   push-cadence: low-volume rule processing → scale to 1 instance
   ```

2. **Database Selection**: Different databases per service
   ```
   push-blaster: AWS RDS (main tradeblock data)
   push-cadence: Neon (dedicated push records)
   ```

3. **Environment Isolation**: Different env vars per service
   ```
   push-blaster: CADENCE_SERVICE_URL, DATABASE_URL
   push-cadence: PUSH_CADENCE_DATABASE_URL (different database)
   ```

### Docker Multi-Stage Build Optimization

**Current Strategy:**
```dockerfile
FROM node:20-alpine AS builder    # Stage 1: Build (360MB)
RUN npm ci
RUN npm run build
# Build artifacts: .next, node_modules, public

FROM node:20-alpine AS runner     # Stage 2: Runtime (150MB)
COPY --from=builder /app          # Only copy final artifacts
# Result: ~150MB production image
```

**Benefits:**
- Removes ~210MB of source code, build tools, development dependencies
- Only necessary runtime code in production
- Faster deployment (less data to push)
- More secure (no source code in production)

### Monitoring & Observability

**Available Endpoints:**
- `GET /api/health` - Detailed health metrics
- Logs available via `railway logs`
- Railway dashboard metrics (CPU, Memory, Network)

**Recommended Monitoring:**
```bash
# Check service status periodically
watch -n 60 'curl -s https://push-notification-system-production.up.railway.app/api/health | jq ".status"'

# Monitor logs for errors
railway logs -f | grep -i error

# Check memory usage trending
railway logs -f | grep "memoryUsage"
```

### Performance Tuning

**Current Configuration Recommendations:**

```
Service: push-blaster
├─ Memory: 512MB (auto-scaling from Railway)
├─ CPU: 0.25 vCPU
├─ Instances: 1 (auto-restart on failure)
└─ Max Restarts: 10

Service: push-cadence-service
├─ Memory: 512MB
├─ CPU: 0.25 vCPU
├─ Instances: 1
└─ Healthcheck: 300s timeout
```

**If experiencing slowness:**
1. Check memory usage: `railway shell` → `free -h`
2. Check database slow queries: AWS RDS console
3. Increase Railway plan: Upgrade to 1GB+ RAM
4. Scale to multiple instances: `railway scale 1 2G`

---

## 10. Deployment Workflow Summary

### Complete Deployment Workflow

```
Local Development
├─ git commit changes
└─ git push origin master

GitHub/Git Repository
└─ Code committed and available

Railway Deployment Trigger
├─ Option A: Automatic (on git push)
├─ Option B: Manual (railway up --detach)
└─ Option C: Env var update (auto-redeploy)

Railway Build Process
├─ Pull code from repository
├─ Read Dockerfile (or Dockerfile.cadence)
├─ Build Docker image (multi-stage)
├─ Tag image: push-notification-system:latest
└─ Push to Railway registry

Container Creation
├─ Create container from image
├─ Set environment variables
├─ Mount volumes if needed
└─ Open port 3000

Application Startup
├─ Run CMD: npm run start:railway
├─ Next.js server initialization
├─ Database connection pool creation
├─ AutomationEngine initialization & restoration
└─ Ready to serve requests

Health Verification
├─ Railway tests healthcheck endpoint
├─ push-cadence: Returns 200/503
├─ push-blaster: Always returns 200
└─ If healthy: Start routing traffic
    If unhealthy: Restart container

Service Running
├─ Accepts HTTP requests
├─ Sends push notifications
├─ Processes automation rules
├─ Logs available via railway logs
└─ Monitored by Railway platform
```

---

## 11. Getting Help & Support

### Quick Debugging Commands

```bash
# Current status
railway status

# View recent logs
railway logs -n 50

# SSH into container
railway shell
cd /app
ls -la

# Test database from container
psql $DATABASE_URL -c "SELECT 1;"
psql $PUSH_CADENCE_DATABASE_URL -c "SELECT 1;"

# Check environment
env | grep -E "DATABASE|FIREBASE|CADENCE"

# Monitor real-time
railway logs -f | grep -v "Next.js"
```

### When Contacting Support

Include:
1. **Deployment ID**: `railway deployments | head -1`
2. **Recent Logs**: `railway logs -n 100`
3. **Environment Check**: `railway variable list` (without values)
4. **Error Message**: Full error text from logs
5. **Attempted Actions**: What have you tried?

### Useful Links

- Railway Documentation: https://docs.railway.app/
- Next.js Deployment: https://nextjs.org/docs/deployment/
- Docker Documentation: https://docs.docker.com/
- PostgreSQL Docs: https://www.postgresql.org/docs/

---

## Summary

The Push Notification System uses Railway to deploy two coordinated services:

1. **push-blaster** (port 3001): Main API for sending notifications
   - Builds from: `Dockerfile`
   - Config: `railway.toml`
   - Connects: AWS RDS, Firebase
   - Health: `/api/health` (always 200)

2. **push-cadence-service** (port 3002): Manages cadence rules
   - Builds from: `Dockerfile.cadence`
   - Config: `railway.cadence.toml`
   - Connects: Neon PostgreSQL
   - Health: `/api/health` (200/503)

Both services:
- Use Node 20 Alpine for minimal size
- Deploy via Docker multi-stage build
- Require external databases (not Railway-managed)
- Use `$PORT` environment variable
- Support automatic restarts on failure

Follow the deployment checklist before each deployment and monitor logs during startup. The healthcheck endpoints provide detailed diagnostic information for troubleshooting.

