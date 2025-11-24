---
description: Decompose a node into MSCW-categorized child nodes
category: workflow
allowed-tools: Read, Bash(curl:*), TodoWrite
argument-hint: "[optional: additional context or instructions]"
model: claude-sonnet-4-5-20250929
---

# MSCW Node Decomposition Command

This command decomposes a selected parent node into logical child sub-nodes with MSCW categorization (Must/Should/Could/Won't).

## Context Gathering

Project documentation and MSCW methodology:
@CLAUDE.md

User-provided additional context: $ARGUMENTS

---

## Your Task

Decompose a parent node in the MSCW tree into logical child sub-nodes, apply MSCW categorization, and persist the results to the database.

### Step 1: Identify the Parent Node

Ask the user which node they want to decompose. You need:
- **Node ID** (CUID format: e.g., "cmg30m2ll0000...")
- **Project ID** (current project: `cmg30m2ll00001cs8vu82357k`)

If the user hasn't specified, ask: "Which node would you like to decompose? Please provide the node ID."

To help the user find node IDs, you can suggest running:
```bash
curl -s http://localhost:3009/api/project/cmg30m2ll00001cs8vu82357k/tree | \
  jq -r '.project.nodes[] | "\(.id) - \(.label) - Category: \(.category)"'
```

### Step 2: Fetch Parent Node Details

Once you have the parent node ID, fetch its details to understand context:

```bash
curl -s http://localhost:3009/api/project/cmg30m2ll00001cs8vu82357k/tree | \
  jq --arg nodeId "PARENT_NODE_ID" '.project.nodes[] | select(.id == $nodeId)'
```

Review the parent node's:
- **Label** - What feature/component is being decomposed
- **Category** - Current MSCW category (provides context for children)
- **Justification** - Reasoning that may guide sub-components
- **Existing children** - Check if node already has children to avoid duplicates

### Step 3: Analyze and Decompose

Using the parent node's content, project context from CLAUDE.md, and any user-provided context ($ARGUMENTS), identify logical sub-components.

**Analysis Framework:**

Consider these dimensions when decomposing:

1. **Technical Architecture**
   - Frontend/UI components
   - Backend API endpoints
   - Data models and schemas
   - Database migrations
   - Testing requirements
   - Deployment/infrastructure needs

2. **User-Facing Elements**
   - User flows and interactions
   - UI/UX components
   - Forms and validation
   - Error handling and feedback
   - Accessibility requirements

3. **Non-Functional Requirements**
   - Performance optimization
   - Security measures
   - Monitoring and logging
   - Documentation
   - Error recovery

4. **Dependencies and Integration**
   - Third-party services
   - Internal API dependencies
   - Authentication/authorization
   - Data migration needs

**Decomposition Guidelines:**
- Aim for 4-8 child nodes (optimal range)
- Keep children at similar abstraction level
- Each child should be a distinct, implementable unit
- Avoid overlap between children
- Consider natural sequencing (what depends on what)

**Node Naming Convention (CRITICAL):**
- **Every child node MUST start with a hierarchical number**
- Format: `ParentNumber.ChildNumber NodeLabel`
- Example: If decomposing node "5.1 Compass Management", children should be:
  - `5.1.1 Compass Data Model`
  - `5.1.2 Compass UI Access Point`
  - `5.1.3 Compass View Panel`
  - etc.
- If decomposing a root node (e.g., "5 Feature Name"), children should be:
  - `5.1 First Child`
  - `5.2 Second Child`
  - `5.3 Third Child`
- **This numbering is REQUIRED for all decompositions** - it maintains project hierarchy and enables proper organization

### Step 4: Apply MSCW Categorization

For each sub-component, assign one of:

- **Must** - Core problem cannot be solved without it. The parent feature is non-functional without this component.
- **Should** - Important and valuable, but the parent feature can technically function without it. Deferrable if time/resources are constrained.
- **Could** - Nice-to-have enhancement. Provides additional value but is not essential to the core functionality. Clear differentiator vs. essential.
- **Won't** - Explicitly out of scope for this iteration. May be valuable but consciously deferred or rejected.

**MSCW Categorization Rules:**

1. **Challenge Every "Must":**
   - What specifically breaks if this is removed?
   - Can we launch a minimal version without it?
   - Is this truly a "Must" or an optimistic "Should"?

2. **Reference Compass Principles:**
   - Look for Compass principles in CLAUDE.md or project context
   - Justify categories by alignment with Compass
   - Example: "MVP-first approach" → Many features become Should/Could

3. **Consider Dependencies:**
   - If child A depends on child B, B is likely higher priority
   - Foundational components (auth, data models) often Must
   - UI polish and enhancements often Should/Could

4. **Avoid Overstuffed "Must" Lists:**
   - If >50% of children are "Must", re-evaluate
   - Ask: "If forced to cut half the Musts, what remains?"

**Justification Requirements:**
- 1-2 sentences per node
- Be specific about WHY this category was chosen
- Reference Compass principles when applicable
- Mention dependencies or risks if relevant
- Use clear, actionable language

**Example Good Justifications:**
- ✅ "Core authentication endpoint - without this, users cannot log in and access the application at all."
- ✅ "Password reset flow is important for UX but MVP can launch with admin-assisted resets."
- ✅ "Social login provides convenience but adds third-party dependencies; deferred per MVP-first Compass principle."

**Example Poor Justifications:**
- ❌ "This is important" (too vague)
- ❌ "We should build this" (doesn't explain why or reference methodology)
- ❌ "" (empty - never acceptable)

### Step 5: Present Decomposition Plan

Before creating nodes in the database, present your analysis to the user for review:

**Format:**
```
I'll decompose "[Parent Node Label]" (e.g., "5.1 Compass Management") into the following child nodes:

1. [Must] 5.1.1 Child Node Label
   → Justification referencing why this is Must category

2. [Must] 5.1.2 Another Child Node
   → Justification with Compass principle reference

3. [Should] 5.1.3 Child Node Label
   → Justification explaining why deferrable

4. [Could] 5.1.4 Child Node Label
   → Justification for nice-to-have status

5. [Won't] 5.1.5 Child Node Label
   → Justification for explicit exclusion

Total: X Must, Y Should, Z Could, W Won't

Does this decomposition look correct? Should I proceed with creating these nodes?
```

**IMPORTANT**: Always include the hierarchical number prefix in the label when creating nodes!

**Wait for user approval before proceeding to Step 6.**

### Step 6: Create Nodes in Database

Once user approves, create each child node using the Node Creation API.

**API Configuration:**
- **Endpoint:** `POST http://localhost:3009/api/node`
- **Project ID:** `cmg30m2ll00001cs8vu82357k`
- **Parent ID:** The node ID from Step 1
- **Default Work Status:** `"not started"` (for all new nodes)
- **Default Include in Scope:** `true`
- **Default Expanded:** `false`

**Node Creation Loop:**

For each child node in your decomposition plan, execute a single curl command:

```bash
curl -X POST http://localhost:3009/api/node \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "cmg30m2ll00001cs8vu82357k",
    "parentId": "PARENT_NODE_ID",
    "label": "Child Node Label",
    "category": "Must",
    "workStatus": "not started",
    "justification": "Justification text here",
    "includeInScope": true,
    "expanded": false
  }'
```

**CRITICAL**: Execute the curl command **ONLY ONCE** per node. Do not execute multiple commands for the same node.

**After each curl execution:**
1. **Validate response:**
   - Success: HTTP 201 with `{"node": {...}, "edge": {...}}`
   - Extract and log the created node's ID
   - Continue to next node

2. **Handle errors gracefully:**
   - Log the error message
   - Continue creating remaining nodes (don't fail entire decomposition)
   - Summarize failures at the end

**Important Notes:**
- Category values are case-sensitive: `"Must"`, `"Should"`, `"Could"`, `"Wont"` (not "Won't")
- Label must be 1-255 characters
- Justification should be meaningful, not empty (though technically optional)
- Each API call is atomic (node + edge created together in transaction)

### Step 7: Provide Summary to User

**CRITICAL**: After creating all nodes, you MUST provide a comprehensive breakdown summary directly in your response. This summary allows the user to review what was created without needing to check the UI.

**Success Output Format:**
```
✓ Successfully decomposed "[Parent Node Label]" into X child nodes:

1. ✓ [Must] Child Node Label
   → Justification
   → Node ID: clxxx001...

2. ✓ [Should] Another Child Node
   → Justification
   → Node ID: clxxx002...

[... continue for all nodes ...]

Summary:
- Total nodes created: X
- Must: Y nodes
- Should: Z nodes
- Could: A nodes
- Won't: B nodes

All nodes created successfully! ✓

Next steps:
1. Refresh the UI at http://localhost:3009
2. Expand the parent node to see children
3. Edit categories/justifications in sidebar if needed
4. Continue decomposing child nodes for deeper breakdown
```

**IMPORTANT**:
- Include the full label for each node (with hierarchical numbering)
- Show the justification for each node (helps user verify MSCW decisions)
- List all created node IDs (enables traceability and debugging)
- Provide the category breakdown count (validates MSCW distribution)
- Edge IDs can be omitted from the summary (less relevant to user)

**Partial Success Output Format (if some nodes failed):**
```
⚠ Partially completed decomposition of "[Parent Node Label]":

✓ Successfully created (X nodes):

1. ✓ [Must] Child Node Label
   → Justification
   → Node ID: clxxx001

2. ✓ [Should] Another Node
   → Justification
   → Node ID: clxxx002

✗ Failed to create (Y nodes):

1. ✗ [Could] Failed Node Label
   → Error: Validation failed - Label exceeds 255 character limit
   → Suggestion: Shorten label to under 255 characters

2. ✗ [Won't] Another Failed Node
   → Error: 404 Not Found - Parent node does not exist
   → Suggestion: Verify parent node ID is correct

Summary: X of Z nodes created successfully (Y failed).

Please manually create the failed nodes or re-run the command with corrections.
```

**Remember**: Always provide this summary in your final response to the user, regardless of whether you encountered errors. The user relies on this summary to understand what was accomplished.

### Step 8: Troubleshooting Common Errors

**Error: "Node not found (404)"**
- Parent node ID is invalid or doesn't exist
- Solution: Verify node ID using the curl command from Step 1

**Error: "Validation failed - Category must be one of: Must, Should, Could, Wont"**
- Category value has incorrect capitalization or spelling
- Solution: Use exact values: "Must", "Should", "Could", "Wont" (NOT "Won't")

**Error: "Label must be 255 characters or less"**
- Node label is too long
- Solution: Shorten the label, move details to justification field

**Error: "Failed to connect to API"**
- Development server is not running
- Solution: Start server with `npm run dev` on port 3009

**Error: "Project already has a root node"**
- Trying to create a node with parentId: null when root exists
- Solution: Always provide valid parentId (never null for decomposition)

---

## Additional Guidelines

### Best Practices

1. **Balance Categories:**
   - Aim for realistic distribution (not 90% Must)
   - Typical healthy ratio: 30-40% Must, 30-40% Should, 20-30% Could, 5-10% Won't

2. **Specific Justifications:**
   - Reference Compass principles from CLAUDE.md
   - Explain trade-offs and dependencies
   - Be honest about why something is deferred (Won't/Could)

3. **Logical Grouping:**
   - Group related components together in sequence
   - Consider natural implementation order
   - Frontend → Backend → Data → Testing is often logical

4. **Consistent Abstraction:**
   - Don't mix high-level ("User Management") with low-level ("Add semicolon to line 42")
   - Keep children at similar granularity

5. **Iterative Refinement:**
   - Remind user they can edit categories/justifications in UI later
   - This is just the first pass - MSCW is iterative (Step 5 of methodology)

### When NOT to Decompose

- Parent node is already at implementation level (too granular)
- Parent node has >10 existing children (consider nested decomposition)
- User hasn't provided enough context to make informed decisions
- Parent node is marked "Won't" (out of scope entirely)

In these cases, explain why and suggest alternatives.

---

## Example Execution

**User:** `/mscw:decompose Focus on backend components, assume frontend is handled separately`

**You (AI):**
```
I'll help you decompose a node with focus on backend components.

Which node would you like to decompose? Please provide the node ID.

To find node IDs, I can run:
curl -s http://localhost:3009/api/project/cmg30m2ll00001cs8vu82357k/tree | \
  jq -r '.project.nodes[] | "\(.id) - \(.label)"'
```

**User:** `cmg123abc456` (example ID for node "3.2 User Authentication System")

**You (AI):**
```
Fetching parent node details...

Parent Node: "3.2 User Authentication System" (Category: Must)

Based on the parent node and your focus on backend components, I'll decompose this into:

1. [Must] 3.2.1 JWT Token Generation Service
   → Core authentication requires token-based session management; cannot authenticate users without secure token issuance.

2. [Must] 3.2.2 User Credentials Validation Endpoint
   → Backend API must validate username/password against database; frontend cannot function without this endpoint.

3. [Must] 3.2.3 Password Hashing Service
   → Critical security requirement; storing plaintext passwords is unacceptable per security-first Compass principle.

4. [Should] 3.2.4 Session Refresh Token Logic
   → Improves UX by avoiding frequent re-logins, but MVP can launch with short-lived tokens only.

5. [Should] 3.2.5 Rate Limiting for Login Attempts
   → Important security measure to prevent brute force attacks, but can be added post-launch if time-constrained.

6. [Could] 3.2.6 OAuth Provider Integration (Backend)
   → Nice-to-have for social login, but adds complexity and third-party dependencies; deferred per MVP-first approach.

7. [Won't] 3.2.7 Biometric Authentication Backend
   → Explicitly out of scope for Phase 1; requires mobile app integration and additional infrastructure.

Total: 3 Must, 2 Should, 1 Could, 1 Won't

Does this decomposition look correct? Should I proceed with creating these nodes?
```

**User:** Yes, proceed

**You (AI):**
```
Creating nodes in database...

✓ [Must] 3.2.1 JWT Token Generation Service (ID: clxxx001, Edge: cledge001)
✓ [Must] 3.2.2 User Credentials Validation Endpoint (ID: clxxx002, Edge: cledge002)
✓ [Must] 3.2.3 Password Hashing Service (ID: clxxx003, Edge: cledge003)
✓ [Should] 3.2.4 Session Refresh Token Logic (ID: clxxx004, Edge: cledge004)
✓ [Should] 3.2.5 Rate Limiting for Login Attempts (ID: clxxx005, Edge: cledge005)
✓ [Could] 3.2.6 OAuth Provider Integration (Backend) (ID: clxxx006, Edge: cledge006)
✓ [Won't] 3.2.7 Biometric Authentication Backend (ID: clxxx007, Edge: cledge007)

✓ Successfully decomposed "3.2 User Authentication System" into 7 child nodes!

Summary:
- Must: 3 nodes
- Should: 2 nodes
- Could: 1 node
- Won't: 1 node

All nodes created successfully! Refresh the UI at http://localhost:3009 to see the updated tree.
```

---

## Remember

- **ALWAYS provide the breakdown summary in your final response** (Step 7 format)
- Always ask for user approval before creating nodes
- Execute curl command **ONLY ONCE per node** (avoid duplicates)
- Handle errors gracefully and continue with remaining nodes
- Provide clear, actionable feedback with node IDs and justifications
- Reference MSCW methodology and Compass principles
- Challenge assumptions, especially for "Must" categorizations
- Be rigorous and methodical in your analysis

## Final Checklist

Before completing the decomposition task, verify:

- [ ] User approved the decomposition plan
- [ ] Each node created with single curl command only
- [ ] All successful node creations logged with IDs
- [ ] All errors logged with suggestions
- [ ] **Comprehensive summary provided to user in chat**
- [ ] Category distribution validated (not >50% Must)
- [ ] All justifications reference Compass or methodology