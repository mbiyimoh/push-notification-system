# Ideation: Python Database Connectivity on Railway

**Date**: 2025-11-28
**Status**: Research Complete - Awaiting Decision
**Document Type**: Ideation / Root Cause Analysis

---

## 1. Intent & Assumptions

### Primary Goal
Achieve reliable daily automation execution on Railway that successfully runs Python scripts which query the AWS RDS PostgreSQL database.

### Current Problem
Python scripts fail with "connection timeout expired" when attempting to connect from Railway to AWS RDS. The automation engine spawns Python subprocesses that cannot establish database connections, causing all script executions to fail with exit code null (killed by timeout).

### Key Constraints
- Must maintain existing automation functionality (audience generation scripts)
- Budget considerations for solution selection
- Minimize disruption to existing architecture if possible
- Open to platform migration or language rewrites if necessary

### Assumptions
- Node.js database connectivity works reliably (connection pool maintains persistent connections)
- Python scripts are essential for complex audience generation queries
- Railway Pro tier is an acceptable cost if it solves the problem immediately
- User requires VPN to connect to RDS from local machine (indicating IP-based security)

---

## 2. Pre-reading Log

### Files Examined

| File | Purpose | Key Findings |
|------|---------|--------------|
| `shared/python-utilities/sql_utils.py` | Python DB connection logic | 120s timeout, 3 retries, sslmode=require - all attempts fail |
| `services/push-blaster/src/lib/db.ts` | Node.js DB pool | Persistent pool (max 10 connections) - works reliably |
| `services/push-blaster/src/lib/debugPythonRunner.ts` | Python subprocess handler | 5-minute timeout, heartbeat logging |
| `services/push-blaster/src/lib/scriptExecutor.ts` | Script execution engine | Spawns Python with PYTHONPATH, env vars |
| `developer-guides/railway-deployment-guide.md` | Deployment docs | Section 5.3: "AWS RDS requires inbound rules for Railway IP ranges" |
| `developer-guides/push-blaster-guide.md` | Architecture guide | Python scripts for audience generation |

### Log Analysis (Most Recent Failed Run)

**Timeline**: 10:25:36 - 10:30:46 (exactly 5 minutes - script timeout hit)

```
10:25:36 - Script execution started
10:25:36 - [sql_utils] Attempting DB connection to: ...@production-database.cluster-cseupqwlh6at.us-east-1.rds.amazonaws.com
10:25:36 - [sql_utils] Connect timeout: 120s
10:27:36 - [sql_utils] ERROR: Could not connect - timeout expired (Attempt 1)
10:27:36 - [sql_utils] Retrying connection in 5s (attempt 1/3)
10:27:41 - [sql_utils] Attempting DB connection (Attempt 2)
10:29:41 - [sql_utils] ERROR: Could not connect - timeout expired (Attempt 2)
10:29:41 - [sql_utils] Retrying connection in 10s (attempt 2/3)
10:29:51 - [sql_utils] Attempting DB connection (Attempt 3)
10:30:46 - [DEBUG_RUNNER] Process timeout after 300000ms, killing process
```

**Math**: 120s + 5s + 120s + 10s + 55s = 310s > 300s script timeout

---

## 3. Codebase Map

```
push-notification-system/
├── services/
│   ├── push-blaster/              # Main service (Railway)
│   │   ├── src/lib/
│   │   │   ├── db.ts              # Node.js connection pool (WORKS)
│   │   │   ├── scriptExecutor.ts  # Python subprocess spawner
│   │   │   └── debugPythonRunner.ts # Python runner with timeout
│   │   ├── audience-generation-scripts/  # Python scripts (Railway)
│   │   └── Dockerfile             # Alpine + Python3 + Node
│   │
│   └── push-cadence-service/      # Cadence service (Railway)
│
├── shared/
│   └── python-utilities/
│       └── sql_utils.py           # Python DB utilities (FAILS)
│
└── projects/
    └── push-automation/
        └── audience-generation-scripts/  # Source Python scripts
```

### Database Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│  Railway (Dynamic)  │         │  AWS RDS (Secured)  │
│  IPs: Ephemeral     │────X────│  Security Group:    │
│                     │         │  - Whitelist only   │
└─────────────────────┘         └─────────────────────┘
         │                               │
         │ Python (new connections)      │
         └─────── BLOCKED ───────────────┘

         │ Node.js (pool - persistent)   │
         └─────── WORKS ─────────────────┘
```

---

## 4. Root Cause Analysis

### Why Node.js Works But Python Fails

| Aspect | Node.js (`pg` Pool) | Python (`psycopg2`) |
|--------|---------------------|---------------------|
| Connection Strategy | Pool maintains 10 persistent connections | Fresh connection per script execution |
| TCP Behavior | Long-lived, keeps connection alive | New TCP handshake each time |
| When IP Changes | Existing connections stay valid | New connection attempts with new IP |
| Result | Works reliably | Times out (IP blocked by security group) |

### The Core Issue

1. **Railway uses dynamic/ephemeral IP addresses** - Every deployment, and potentially during runtime, the service may egress from different IP addresses
2. **AWS RDS security groups are IP-whitelist based** - Only pre-approved IPs can connect
3. **Node.js connection pool** established persistent connections early (when the IP was perhaps whitelisted or the security group was more permissive)
4. **Python creates fresh connections** - Each script execution attempts a new TCP connection, which gets blocked

### Why It "Worked Before"

Several possibilities:
1. **Security group change** - AWS RDS security group rules may have been tightened recently
2. **IP rotation** - Railway rotated to a new IP range that isn't whitelisted
3. **Node.js pool masking the issue** - The service appeared to work because Node.js queries succeeded, but Python was always failing (or wasn't being used frequently)
4. **VPC configuration change** - Network topology changes on either Railway or AWS side

---

## 5. Solution Options

### Option A: Railway Pro with Static Outbound IPs

**Summary**: Upgrade to Railway Pro tier and enable Static Outbound IPs add-on

**Cost**: ~$20/month (Pro tier, includes static IPs)

**Pros**:
- Immediate fix - no code changes required
- Simple configuration - just whitelist 2 static IPs in AWS RDS security group
- Railway handles all IP management
- Maintains current architecture

**Cons**:
- Ongoing monthly cost
- Vendor lock-in to Railway
- Need AWS access to modify security group

**Implementation**:
1. Upgrade Railway project to Pro tier
2. Enable Static Outbound IPs in Railway dashboard
3. Get the 2 assigned IPs from Railway
4. Add those IPs to AWS RDS security group inbound rules (port 5432)
5. Test Python script execution

**Time to Implement**: ~30 minutes

---

### Option B: Migrate to Render.com

**Summary**: Move services to Render.com which provides static outbound IPs on all tiers

**Cost**: $0-7/month (Free tier or Starter with static IPs)

**Pros**:
- Better value - static IPs included on lower tiers
- Free tier available for testing
- Similar deployment model (Docker support)
- Native static outbound IPs

**Cons**:
- Migration effort required
- Learning new platform
- Different deployment workflow
- May need to update CI/CD

**Implementation**:
1. Create Render account and project
2. Connect GitHub repository
3. Create web services for push-blaster and push-cadence
4. Configure environment variables
5. Get static outbound IPs from Render dashboard
6. Update AWS RDS security group
7. Update DNS/URLs
8. Test full automation flow

**Time to Implement**: 2-4 hours

---

### Option C: Add AWS RDS Proxy

**Summary**: Deploy AWS RDS Proxy to handle connection pooling at the database level

**Cost**: ~$22/month (based on db.t3.medium proxy)

**Pros**:
- Handles connection pooling for all clients (Python and Node.js)
- Better connection management
- Adds failover support
- Can work with IAM authentication

**Cons**:
- Additional AWS infrastructure to manage
- Requires AWS expertise to set up
- Adds network latency
- Doesn't solve the IP issue directly (still need to whitelist Railway)
- Most benefit when combined with Static IPs

**Implementation**:
1. Create RDS Proxy in AWS Console
2. Configure proxy for PostgreSQL
3. Set up security groups (proxy to RDS)
4. Update application DATABASE_URL to point to proxy endpoint
5. Configure IAM roles if using IAM auth
6. Test both Node.js and Python connections

**Time to Implement**: 1-2 hours

**Note**: This doesn't fully solve the problem alone - Railway IPs still need whitelisting. Best combined with Option A.

---

### Option D: Rewrite Python Scripts to TypeScript

**Summary**: Eliminate Python dependency by rewriting audience generation scripts in TypeScript

**Cost**: Development time only

**Pros**:
- Eliminates Python subprocess complexity entirely
- Uses existing Node.js connection pool (which works)
- Better error handling integration with Node.js
- Reduces Docker image size (no Python needed)
- Single language codebase
- Eliminates the root cause permanently

**Cons**:
- Significant development effort (5 Python scripts)
- Must reimplement SQL query logic
- Testing effort
- Risk of introducing bugs during migration

**Scripts to Convert**:
1. `generate_showcase_push_csvs.py` - Showcase audience generation
2. `generate_layer_2_push_csv.py` - Trending shoe audiences
3. `generate_layer_3_push_csvs.py` - Behavior-responsive audiences
4. `generate_new_user_nudges.py` - New user targeting
5. `generate_new_user_waterfall.py` - Onboarding waterfall

**Implementation**:
1. Create TypeScript equivalents in `src/lib/audienceGenerators/`
2. Use existing `db.ts` pool for queries
3. Implement CSV generation with `csv-writer` or similar
4. Update `scriptExecutor.ts` to call TypeScript functions instead
5. Test each script thoroughly
6. Remove Python dependencies from Dockerfile

**Time to Implement**: 1-2 days per script (5-10 days total)

---

### Option E: Vercel Migration

**Summary**: Move to Vercel and use Vercel Postgres or external database connection

**Cost**: $20/month (Pro tier for better limits)

**Pros**:
- Excellent Next.js integration (push-blaster is Next.js)
- Serverless functions scale automatically
- Edge functions available
- Good DX and deployment experience

**Cons**:
- **Cannot run Python in Vercel** - would require Option D (TypeScript rewrite)
- Serverless has cold start issues
- Connection limits on serverless functions
- May need architectural changes for long-running scripts

**Note**: This option requires Option D (TypeScript rewrite) as a prerequisite. Vercel does not support Python in the same deployment model.

---

## 6. Recommendation Matrix

| Option | Cost | Effort | Time | Risk | Solves Root Cause |
|--------|------|--------|------|------|-------------------|
| A. Railway Static IPs | $20/mo | Low | 30 min | Low | Yes (immediate) |
| B. Render Migration | $0-7/mo | Medium | 2-4 hrs | Medium | Yes |
| C. RDS Proxy | $22/mo | Medium | 1-2 hrs | Medium | Partial (need IPs) |
| D. TypeScript Rewrite | $0 | High | 5-10 days | Medium | Yes (permanent) |
| E. Vercel Migration | $20/mo | High | Days | High | Requires D |

### Phased Recommendation

**Immediate (Today)**:
- **Option A: Railway Static IPs** - Fastest path to working automation

**Short-term (This Week)**:
- Test Option B (Render.com) in parallel - better long-term value

**Medium-term (Next Sprint)**:
- Begin Option D (TypeScript rewrite) - eliminates Python dependency permanently
- This future-proofs the system and removes the cross-platform complexity

**Long-term**:
- Complete TypeScript migration
- Evaluate if platform migration still makes sense

---

## 7. Clarifications Needed

Before proceeding, please indicate your preference:

### Q1: Immediate Fix Preference
- [ ] **A. Railway Static IPs** - Pay $20/mo, fix in 30 minutes
- [ ] **B. Render Migration** - Free/cheaper, fix in 2-4 hours
- [ ] **Other** - Specify alternative approach

### Q2: Long-term Strategy
- [ ] **Stay on Railway** - Use static IPs, consider TypeScript rewrite later
- [ ] **Migrate to Render** - Better value, keep Python scripts
- [ ] **Full TypeScript Rewrite** - Eliminate Python dependency
- [ ] **Other** - Specify preference

### Q3: Do you have AWS Console access?
- [ ] **Yes** - Can modify RDS security group myself
- [ ] **No** - Need to coordinate with team member
- [ ] **Need guidance** - Have access but need help with steps

### Q4: Budget constraint?
- [ ] **$20/mo is fine** - Simplicity over cost
- [ ] **Prefer free/cheaper** - Willing to invest more time
- [ ] **Other** - Specify budget constraints

---

## 8. Next Steps

Once you indicate your preference, I will:

1. **If Option A (Railway Static IPs)**:
   - Provide step-by-step Railway Pro upgrade instructions
   - Guide you through AWS security group modification
   - Test the automation execution

2. **If Option B (Render Migration)**:
   - Create a migration spec document
   - Set up Render project
   - Migrate services with testing

3. **If Option D (TypeScript Rewrite)**:
   - Create a detailed spec for each script conversion
   - Implement and test incrementally
   - Remove Python dependencies

---

## Appendix: Log Evidence

### Failed Connection Timeline
```
[STDOUT] [sql_utils] Attempting DB connection to: ...@production-database.cluster-cseupqwlh6at.us-east-1.rds.amazonaws.com:5432/tradeblock_production
[STDOUT] [sql_utils] Connect timeout: 120s
[STDOUT] [sql_utils] Added sslmode=require to connection string
... (120 seconds pass)
[STDOUT] [sql_utils] ERROR: Could not connect to the database: connection to server at "production-database.cluster-cseupqwlh6at.us-east-1.rds.amazonaws.com" (23.21.88.66), port 5432 failed: timeout expired
[STDOUT] [sql_utils] Retrying connection in 5s (attempt 1/3)...
... (cycle repeats)
[DEBUG_RUNNER] Process timeout after 300000ms, killing process
```

### Node.js Health Check (Same Service)
```json
{
  "status": "healthy",
  "database": "degraded",
  "responseTime": 10234
}
```
Note: Node.js can connect (slowly) because the pool maintains existing connections. "degraded" status likely due to high latency, not connection failure.
