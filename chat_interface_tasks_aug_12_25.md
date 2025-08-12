# SearchAI.io Context-Aware Search Restoration - Master Implementation Checklist
**Date:** August 12, 2025  
**Priority:** CRITICAL  
**Timeline:** 4-5 days with 2-4 developers/agents working in hybrid parallel mode
**Version:** 5.0 (Unified with Peer Audit Requirements)

---

## 🚨 CRITICAL INSTRUCTIONS FOR ALL LLM AGENTS

### Peer Audit Requirements
1. **Every task MUST be audited by a DIFFERENT agent than the one who completed it**
2. **The implementing agent MUST mark their agent ID in the task completion**
3. **The auditing agent MUST mark their agent ID in the audit completion**
4. **No agent may audit their own work - this invalidates the checklist**
5. **Audits must be thorough, objective, and include specific findings**

### Agent Identification Protocol
When completing any task or audit, mark it as:
```markdown
- [x] Task completed by: [Agent-A/B/C/D] at [timestamp]
- [x] Audit completed by: [Agent-B/C/D/A] at [timestamp] 
```

### What Constitutes a CORRECT Audit
✅ **A correct audit includes:**
- Verification that the code/change exists at the specified location
- Confirmation that the implementation matches the requirement
- Testing that the change doesn't break existing functionality
- Validation against Convex type system requirements (no duplicates)
- Security review for any user input handling
- Performance impact assessment if applicable
- Specific findings documented (not just "looks good")

### What Constitutes an INCORRECT/INCOMPLETE Audit
❌ **An incorrect audit includes:**
- Generic approval without specific checks ("LGTM", "Approved")
- Auditing your own work (same agent ID)
- Missing verification of critical aspects (types, security, tests)
- Not checking for side effects or breaking changes
- Failing to verify Convex type compliance
- Not testing the actual functionality
- Rubber-stamp approval without detailed review

### Audit Escalation Protocol
If an audit finds issues:
1. Document specific problems found
2. Mark task as "Needs Revision"
3. Original implementer must fix and re-submit
4. Different auditor must re-review

---

## 📋 Master Task Checklist with Peer Audits

## Phase 0: Foundation Setup (1 hour - Sequential)
**Single developer/agent creates foundation for all parallel work**

### 0.1 Directory Structure Creation
- [x] **Task 0.1**: Create all required directories
  - Implementer: [Agent-opus4.1-002] Date: 2025-08-12T20:52:11Z - COMPLETED
  - Create directories:
    ```bash
    mkdir -p convex/{chat,search,generation,lib,internal,migrations}
    mkdir -p convex/lib/security
    mkdir -p src/{components/errors,lib/validation}
    mkdir -p tests/{unit,integration,security,performance}
    mkdir -p docs/{api,phases,baselines}
    ```
  - Verify all directories exist with proper structure
  - Time: 5 minutes

- [ ] **Audit 0.1**: Verify directory structure is complete and correct
  - Auditor: [Agent-___] Date: ___
  - Check all directories exist: `ls -la convex/ src/ tests/ docs/`
  - Verify no typos in directory names
  - Confirm structure matches requirements
  - Document findings: _______________

### 0.2 Performance Baseline Documentation
- [x] **Task 0.2**: Document current performance metrics
  - Implementer: [Agent-opus4.1-001] Date: 2025-08-12T20:53:00Z - COMPLETED
  - File: `docs/baselines/performance.md`
  - Measure and document:
    - Current context building time (ms)
    - Current search query latency (ms)
    - Current message send/receive time (ms)
    - Memory usage (MB)
    - File sizes: http.ts, search.ts, ai.ts (lines)
  - Time: 30 minutes

- [ ] **Audit 0.2**: Verify baseline measurements are accurate
  - Auditor: [Agent-___] Date: ___
  - Re-run at least 2 measurements to verify accuracy
  - Check file line counts: `wc -l convex/*.ts`
  - Confirm metrics are realistic (not placeholder values)
  - Verify file exists and is properly formatted
  - Document findings: _______________

### 0.3 Convex Type Safety Wrapper
- [x] **Task 0.3**: Create central type import file
  - Implementer: [Agent-opus4.1-001] Date: 2025-08-12T20:54:30Z - COMPLETED
  - File: `convex/lib/convexTypes.ts`
  - Code:
    ```typescript
    // CRITICAL: This is the ONLY place we reference generated types
    // All other files import from here, NEVER directly from _generated
    
    // Re-export Convex generated types - NEVER redefine
    export type { Doc, Id } from "../_generated/dataModel";
    export { api, internal } from "../_generated/api";
    
    // DO NOT create any custom types that duplicate Convex types
    // DO NOT define _id, _creationTime or any system fields
    ```
  - Verify imports work correctly
  - Time: 10 minutes

- [ ] **Audit 0.3**: Verify type wrapper follows Convex best practices
  - Auditor: [Agent-___] Date: ___
  - Confirm NO type redefinitions exist
  - Verify exports match current `_generated` structure
  - Check that comments clearly warn against duplication
  - Test import from this file works: `import { Doc } from "./convexTypes"`
  - Ensure no custom types duplicate Convex auto-generated ones
  - Document findings: _______________

### 0.4 Critical API Compatibility Fix
- [x] **Task 0.4**: Add getChat alias for frontend compatibility
  - Implementer: [Agent-opus4.1-001] Date: 2025-08-12T20:56:00Z - COMPLETED
  - File: `convex/chats.ts`
  - Add after getChatById function:
    ```typescript
    export const getChat = query({
      args: { chatId: v.id("chats") },
      handler: async (ctx, args) => {
        // Alias to getChatById for frontend compatibility
        return getChatById(ctx, args);
      }
    });
    ```
  - Test that both functions return same data
  - Time: 10 minutes

- [ ] **Audit 0.4**: Verify API compatibility fix works correctly
  - Auditor: [Agent-___] Date: ___
  - Confirm function exists in correct location
  - Test both getChat and getChatById return identical results
  - Verify args validation uses Convex validators
  - Check no TypeScript errors introduced
  - Ensure this doesn't break existing calls
  - Document findings: _______________

### 0.5 Environment Documentation
- [ ] **Task 0.5**: Document all environment variables
  - Implementer: [Agent-opus4.1-002] Date: 2025-08-12T20:55:00Z - IN PROGRESS
  - File: `docs/environment-variables.md`
  - Document:
    - All required environment variables
    - Dev vs prod differences
    - Security classification (public/secret)
    - Example values (not actual secrets)
  - Time: 20 minutes

- [ ] **Audit 0.5**: Verify environment documentation is complete
  - Auditor: [Agent-___] Date: ___
  - Cross-check with actual .env.example file
  - Verify NO actual secrets are documented
  - Confirm all variables used in code are listed
  - Check classification is accurate
  - Validate markdown formatting
  - Document findings: _______________

---

## Phase 1: Parallel Track A - Frontend Fixes (3 hours)
**Can start after Phase 0 completion**
**Owner: Frontend specialist agent**

### A1.1 Fix Repository API Calls
- [ ] **Task A1.1**: Fix ConvexChatRepository.ts API mismatch
  - Implementer: [Agent-___] Date: ___
  - File: `src/lib/repositories/ConvexChatRepository.ts`
  - Line 66: Change `api.chats.getChat` → `api.chats.getChatById`
  - Import types from `convex/lib/convexTypes.ts` ONLY
  - Verify chat loading works after change
  - Time: 15 minutes

- [ ] **Audit A1.1**: Verify repository API fix is correct
  - Auditor: [Agent-___] Date: ___
  - Confirm change at exact line number
  - Test chat loading functionality
  - Verify imports use convexTypes.ts not _generated directly
  - Check no other API calls need similar fixes
  - Run TypeScript check: `npx tsc --noEmit`
  - Document findings: _______________

### A1.2 Frontend Input Validation
- [ ] **Task A1.2**: Create client-side input validation
  - Implementer: [Agent-___] Date: ___
  - File: `src/lib/validation/input.ts`
  - Implement:
    ```typescript
    export function validateChatInput(input: string): {
      valid: boolean;
      sanitized: string;
      errors: string[];
    } {
      const errors: string[] = [];
      
      // Length validation
      if (input.length > 10000) {
        errors.push("Input too long");
      }
      
      // Basic XSS prevention (server does real sanitization)
      const sanitized = input
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .trim();
      
      return {
        valid: errors.length === 0,
        sanitized,
        errors
      };
    }
    ```
  - Time: 30 minutes

- [ ] **Audit A1.2**: Verify input validation is secure and complete
  - Auditor: [Agent-___] Date: ___
  - Test with malicious inputs (XSS, SQL injection patterns)
  - Verify length limits are appropriate
  - Confirm it's marked as CLIENT-SIDE only
  - Check return type matches interface
  - Test edge cases (empty, null, undefined)
  - Ensure no type duplications from Convex
  - Document findings: _______________

### A1.3 Error Boundary Component
- [ ] **Task A1.3**: Create ChatErrorBoundary component
  - Implementer: [Agent-___] Date: ___
  - File: `src/components/errors/ChatErrorBoundary.tsx`
  - Implement error boundary with:
    - Convex connection error handling
    - User-friendly error messages
    - Retry mechanism
    - Fallback UI
  - Time: 45 minutes

- [ ] **Audit A1.3**: Verify error boundary handles all cases
  - Auditor: [Agent-___] Date: ___
  - Test with simulated Convex connection failure
  - Verify retry mechanism works
  - Check error messages are user-friendly (no stack traces)
  - Confirm component follows React error boundary patterns
  - Test fallback UI renders correctly
  - Document findings: _______________

### A1.4 Fix Message Flow Hook
- [ ] **Task A1.4**: Fix useUnifiedChat message handling
  - Implementer: [Agent-___] Date: ___
  - File: `src/hooks/useUnifiedChat.ts`
  - Line 333: Fix Convex mode message flow
    ```typescript
    if (storageMode === 'convex') {
      // Don't call addMessage - Convex backend handles both messages
      await repository.generateResponse(state.currentChatId, trimmed);
    } else {
      // Local mode - add message then generate
      const userMessage = await repository.addMessage(state.currentChatId, {
        role: "user",
        content: trimmed,
      });
      await repository.generateResponse(state.currentChatId, trimmed);
    }
    ```
  - Time: 20 minutes

- [ ] **Audit A1.4**: Verify message flow fix works correctly
  - Auditor: [Agent-___] Date: ___
  - Test sending messages in Convex mode
  - Test sending messages in local mode
  - Verify no duplicate messages created
  - Check error handling for failed sends
  - Confirm state updates correctly
  - Document findings: _______________

---

## Phase 1: Parallel Track B - Backend Security (3 hours)
**Can start after Phase 0 completion**
**Owner: Security specialist agent**

### B1.1 Robust Sanitization Implementation
- [ ] **Task B1.1**: Create comprehensive sanitization module
  - Implementer: [Agent-___] Date: ___
  - File: `convex/lib/security/sanitization.ts`
  - Implement:
    ```typescript
    export function robustSanitize(input: string): string {
      // 1. Unicode normalization (NFKC)
      let clean = input.normalize('NFKC');
      
      // 2. Remove ALL zero-width characters
      clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      // 3. Convert fullwidth/special Unicode to ASCII
      clean = clean.replace(/[\uFF01-\uFF5E]/g, (ch) => 
        String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
      
      // 4. Detect base64 encoded injections
      const base64Pattern = /(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
      clean = clean.replace(base64Pattern, (match) => {
        if (match.length < 20) return match;
        try {
          const decoded = Buffer.from(match, 'base64').toString();
          if (/system|ignore|instruction/i.test(decoded)) {
            return '[BASE64_BLOCKED]';
          }
        } catch {}
        return match;
      });
      
      // 5. Remove injection patterns
      const patterns = [
        /sys[\s\-_]*tem[\s\-_]*[:：]/gi,
        /ignore[\s\-_]*previous/gi,
        /you[\s\-_]*are[\s\-_]*now/gi,
      ];
      
      for (const pattern of patterns) {
        clean = clean.replace(pattern, '[INJECTION_BLOCKED]');
      }
      
      return clean.slice(0, 2000);
    }
    ```
  - Time: 60 minutes

- [ ] **Audit B1.1**: Verify sanitization blocks all known attacks
  - Auditor: [Agent-___] Date: ___
  - Test with 20+ injection patterns including:
    - Unicode attacks (fullwidth, zero-width, Cyrillic)
    - Base64 encoded injections
    - Template injections
    - System command injections
  - Verify length limit enforced
  - Check performance with large inputs
  - Confirm doesn't break legitimate Unicode (emojis, international chars)
  - Document all test cases and results: _______________

### B1.2 Injection Pattern Library
- [ ] **Task B1.2**: Create comprehensive injection patterns
  - Implementer: [Agent-___] Date: ___
  - File: `convex/lib/security/patterns.ts`
  - Define:
    ```typescript
    export const INJECTION_PATTERNS = {
      systemCommands: [
        /sys[\s\-_]*tem[\s\-_]*[:：]/gi,
        /assistant[\s\-_]*[:：]/gi,
      ],
      instructionOverrides: [
        /ignore[\s\-_]*previous/gi,
        /disregard[\s\-_]*above/gi,
        /forget[\s\-_]*everything/gi,
      ],
      roleEscalation: [
        /you[\s\-_]*are[\s\-_]*now/gi,
        /act[\s\-_]*as/gi,
        /pretend[\s\-_]*to[\s\-_]*be/gi,
      ],
      templateInjection: [
        /\{\{.*?\}\}/g,
        /\${.*?}/g,
      ],
      htmlScripts: [
        /<script[^>]*>.*?<\/script>/gi,
        /<iframe[^>]*>.*?<\/iframe>/gi,
      ]
    };
    ```
  - Time: 30 minutes

- [ ] **Audit B1.2**: Verify pattern coverage is comprehensive
  - Auditor: [Agent-___] Date: ___
  - Cross-reference with OWASP injection lists
  - Test each pattern with variations
  - Verify no false positives on legitimate text
  - Check regex performance (no ReDoS vulnerabilities)
  - Add any missing patterns discovered
  - Document findings: _______________

### B1.3 Web Content Validator
- [ ] **Task B1.3**: Create scraped content validator
  - Implementer: [Agent-___] Date: ___
  - File: `convex/lib/security/webContent.ts`
  - Implement:
    ```typescript
    export function validateScrapedContent(html: string): {
      safe: string;
      removed: string[];
      risk: 'low' | 'medium' | 'high';
    } {
      const removed: string[] = [];
      let risk: 'low' | 'medium' | 'high' = 'low';
      
      // Remove dangerous elements
      const dangerous = [
        { pattern: /<!--[\s\S]*?-->/g, name: 'HTML comments' },
        { pattern: /<script[\s\S]*?<\/script>/gi, name: 'Script tags' },
        { pattern: /<meta[^>]*http-equiv[^>]*>/gi, name: 'Meta refresh' },
      ];
      
      for (const { pattern, name } of dangerous) {
        if (pattern.test(html)) {
          removed.push(name);
          html = html.replace(pattern, '');
          risk = 'medium';
        }
      }
      
      // Check for injection attempts
      if (/system:|ignore previous/i.test(html)) {
        risk = 'high';
      }
      
      return {
        safe: robustSanitize(html),
        removed,
        risk
      };
    }
    ```
  - Time: 30 minutes

- [ ] **Audit B1.3**: Verify web content validation is thorough
  - Auditor: [Agent-___] Date: ___
  - Test with malicious HTML samples
  - Verify all dangerous elements removed
  - Check risk assessment accuracy
  - Test with legitimate web content (no false positives)
  - Confirm integration with robustSanitize
  - Performance test with large HTML documents
  - Document findings: _______________

### B1.4 Schema Security Migration
- [ ] **Task B1.4**: Create migration to remove system role
  - Implementer: [Agent-___] Date: ___
  - File: `convex/migrations/remove_system_role.ts`
  - Implement:
    ```typescript
    import { internalMutation } from "../_generated/server";
    import { v } from "convex/values";
    
    export const removeSystemRole = internalMutation({
      args: {},
      handler: async (ctx) => {
        // Get all messages with system role
        const systemMessages = await ctx.db
          .query("messages")
          .filter((q) => q.eq(q.field("role"), "system"))
          .collect();
        
        // Convert to assistant role
        for (const msg of systemMessages) {
          await ctx.db.patch(msg._id, { role: "assistant" });
        }
        
        return { converted: systemMessages.length };
      }
    });
    ```
  - Time: 30 minutes

- [ ] **Audit B1.4**: Verify migration is safe and complete
  - Auditor: [Agent-___] Date: ___
  - Test on sample data (not production)
  - Verify no data loss occurs
  - Check transaction handling
  - Confirm idempotency (safe to run multiple times)
  - Review error handling
  - Validate against current schema
  - Document findings: _______________

---

## Phase 2: Architecture Refactoring (4 hours - Sequential)
**Must complete after Phase 1**
**Owner: Architecture specialist agent**

### 2.1 Module Structure Creation
- [ ] **Task 2.1**: Create module export structure
  - Implementer: [Agent-___] Date: ___
  - Files to create:
    ```typescript
    // convex/chat/index.ts
    export * from "./queries";
    export * from "./mutations";
    export * from "./subscriptions";
    
    // convex/search/index.ts
    export * from "./planner";
    export * from "./executor";
    export * from "./cache";
    
    // convex/generation/index.ts
    export * from "./pipeline";
    export * from "./context";
    export * from "./streaming";
    ```
  - Time: 20 minutes

- [ ] **Audit 2.1**: Verify module structure is correct
  - Auditor: [Agent-___] Date: ___
  - Check all index files exist
  - Verify export syntax is correct
  - Confirm directory structure matches plan
  - Test imports work from index files
  - No circular dependencies introduced
  - Document findings: _______________

### 2.2 Chat Module Extraction
- [ ] **Task 2.2**: Extract chat functions to modules
  - Implementer: [Agent-___] Date: ___
  - COPY (don't move yet) from `convex/chats.ts`:
    - To `convex/chat/queries.ts`: getChatById, getChatMessages, getChatByShareId
    - To `convex/chat/mutations.ts`: createChat, updateChat, deleteChat
    - To `convex/chat/subscriptions.ts`: (create new subscription functions)
  - Keep originals in place for now
  - Time: 60 minutes

- [ ] **Audit 2.2**: Verify extraction maintains functionality
  - Auditor: [Agent-___] Date: ___
  - Confirm all functions copied correctly
  - Check imports are properly adjusted
  - Verify Convex type imports use convexTypes.ts
  - Test each function still works
  - Ensure no logic was changed during copy
  - Confirm originals still in place
  - Document findings: _______________

### 2.3 Search Module Extraction
- [ ] **Task 2.3**: Extract search functions to modules
  - Implementer: [Agent-___] Date: ___
  - COPY from `convex/search.ts` (1219 lines):
    - To `convex/search/planner.ts`: planSearch, buildSearchQueries (lines ~500-800)
    - To `convex/search/executor.ts`: executeSearch, searchWithProvider (lines ~200-500)
    - To `convex/search/cache.ts`: Cache management code (lines ~66-150)
  - Reduce main file by ~600 lines when complete
  - Time: 90 minutes

- [ ] **Audit 2.3**: Verify search extraction is complete
  - Auditor: [Agent-___] Date: ___
  - Verify line count reduction in main file
  - Check all functions work in new locations
  - Test search planning still functions
  - Verify cache is properly scoped
  - Confirm no broken imports
  - Check for any missed dependencies
  - Document findings: _______________

### 2.4 Generation Module Extraction
- [ ] **Task 2.4**: Extract generation functions to modules
  - Implementer: [Agent-___] Date: ___
  - COPY from `convex/ai.ts` (841 lines):
    - To `convex/generation/pipeline.ts`: Main generation orchestration
    - To `convex/generation/context.ts`: buildContextSummary (from chats.ts)
    - To `convex/generation/streaming.ts`: SSE handling code
  - Add proper sanitization imports
  - Time: 90 minutes

- [ ] **Audit 2.4**: Verify generation extraction works
  - Auditor: [Agent-___] Date: ___
  - Test generation pipeline end-to-end
  - Verify context building works
  - Check streaming functionality
  - Confirm sanitization integrated
  - Validate all imports resolved
  - Test with actual generation request
  - Document findings: _______________

### 2.5 Update Import References
- [ ] **Task 2.5**: Update all imports to use new locations
  - Implementer: [Agent-___] Date: ___
  - Update every file that imports from old locations
  - Point to new module structure
  - Test after each file update
  - Time: 60 minutes

- [ ] **Audit 2.5**: Verify all imports updated correctly
  - Auditor: [Agent-___] Date: ___
  - Run TypeScript compilation: `npx tsc --noEmit`
  - Check for any unresolved imports
  - Verify no duplicate imports
  - Test major workflows still function
  - Confirm using convexTypes.ts for types
  - Document findings: _______________

### 2.6 Remove Old Code Locations
- [ ] **Task 2.6**: Delete duplicated code from original files
  - Implementer: [Agent-___] Date: ___
  - Remove extracted functions from:
    - `convex/chats.ts`
    - `convex/search.ts`
    - `convex/ai.ts`
  - Verify files are now <500 lines each
  - Time: 30 minutes

- [ ] **Audit 2.6**: Verify cleanup is complete
  - Auditor: [Agent-___] Date: ___
  - Check line counts: `wc -l convex/*.ts`
  - Verify all files <500 lines
  - Confirm no functions accidentally deleted
  - Test that nothing is broken
  - Run full validation suite
  - Document findings: _______________

---

## Phase 3: Context Flow Implementation (4 hours)
**Must complete after Phase 2**
**Can parallelize some tasks**

### 3.1 Secure Context Builder
- [ ] **Task 3.1**: Implement secure context building
  - Implementer: [Agent-___] Date: ___
  - File: `convex/generation/context.ts`
  - Implement:
    ```typescript
    import { robustSanitize } from "../lib/security/sanitization";
    import type { Doc, Id } from "../lib/convexTypes";
    
    export async function buildSecureContext(
      ctx: QueryCtx,
      chatId: Id<"chats">
    ): Promise<{
      summary: string;
      recentMessages: Doc<"messages">[];
      shouldUpdateSummary: boolean;
    }> {
      // Get last 50 messages
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .order("desc")
        .take(50)
        .collect();
      
      // Sanitize all content
      const sanitized = messages.map(msg => ({
        ...msg,
        content: robustSanitize(msg.content)
      }));
      
      // Build context summary
      const summary = buildContextSummary(sanitized.reverse());
      
      // Check if rolling summary needs update
      const chat = await ctx.db.get(chatId);
      const shouldUpdateSummary = !chat?.rollingSummaryUpdatedAt ||
        Date.now() - chat.rollingSummaryUpdatedAt > 5 * 60 * 1000;
      
      return {
        summary: robustSanitize(summary),
        recentMessages: sanitized.slice(-5),
        shouldUpdateSummary
      };
    }
    ```
  - Time: 90 minutes

- [ ] **Audit 3.1**: Verify context building is secure and correct
  - Auditor: [Agent-___] Date: ___
  - Test with various chat histories
  - Verify sanitization applied to all content
  - Check summary generation logic
  - Test shouldUpdateSummary timing
  - Verify type safety (using Convex types only)
  - Test with malicious content in history
  - Performance test with 50+ messages
  - Document findings: _______________

### 3.2 Fix Rolling Summary Timing
- [ ] **Task 3.2**: Update rolling summary BEFORE generation
  - Implementer: [Agent-___] Date: ___
  - File: `convex/generation/pipeline.ts`
  - Modify generation flow to:
    1. Build context first
    2. Update rolling summary if needed
    3. Use updated summary for generation
    4. Don't update again after generation
  - Time: 60 minutes

- [ ] **Audit 3.2**: Verify rolling summary timing is correct
  - Auditor: [Agent-___] Date: ___
  - Trace execution flow with logging
  - Verify summary updates before generation
  - Check no duplicate updates occur
  - Test with stale summaries (>5 min old)
  - Confirm summary influences generation
  - Document findings: _______________

### 3.3 Context-Aware Search Planning
- [ ] **Task 3.3**: Implement context-enhanced search
  - Implementer: [Agent-___] Date: ___
  - File: `convex/search/planner.ts`
  - Enhance search queries using context:
    ```typescript
    export async function planContextAwareSearch(
      ctx: ActionCtx,
      userMessage: string,
      context: string,
      recentMessages: Doc<"messages">[]
    ): Promise<SearchPlan> {
      // Extract key terms from context
      const contextTerms = extractKeyTerms(context);
      
      // Build enhanced queries
      const baseQuery = sanitizeForQuery(userMessage);
      const enhancedQueries = [
        baseQuery,
        `${baseQuery} ${contextTerms.join(' ')}`,
        ...generateVariations(baseQuery, contextTerms)
      ];
      
      // Apply MMR for diversity
      const diverseQueries = mmrDiversify(enhancedQueries, baseQuery, 5);
      
      return {
        queries: diverseQueries,
        context: context.slice(0, 500),
        timestamp: Date.now()
      };
    }
    ```
  - Time: 60 minutes

- [ ] **Audit 3.3**: Verify search enhancement works correctly
  - Auditor: [Agent-___] Date: ___
  - Test with various contexts and queries
  - Verify query enhancement is relevant
  - Check MMR diversification works
  - Test sanitization is applied
  - Verify no injection vulnerabilities
  - Measure query quality improvement
  - Document findings: _______________

### 3.4 Real-time Subscriptions
- [ ] **Task 3.4**: Implement Convex subscriptions
  - Implementer: [Agent-___] Date: ___
  - File: `convex/chat/subscriptions.ts`
  - Create real-time subscription:
    ```typescript
    import { query } from "../_generated/server";
    import { v } from "convex/values";
    
    export const subscribeToChatUpdates = query({
      args: { chatId: v.id("chats") },
      handler: async (ctx, args) => {
        const chat = await ctx.db.get(args.chatId);
        if (!chat) return null;
        
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
          .order("asc")
          .collect();
        
        return {
          chat,
          messages,
          isGenerating: chat.isStreaming || false,
          streamedContent: messages.find(m => m.isStreaming)?.streamedContent,
          rollingSummary: chat.rollingSummary,
          lastUpdated: Date.now()
        };
      }
    });
    ```
  - Time: 45 minutes

- [ ] **Audit 3.4**: Verify subscriptions work in real-time
  - Auditor: [Agent-___] Date: ___
  - Test real-time updates (no polling)
  - Verify all fields populated correctly
  - Check performance with large message lists
  - Test error handling for missing chats
  - Confirm Convex reactivity working
  - Measure update latency (<50ms target)
  - Document findings: _______________

### 3.5 Frontend Subscription Integration
- [ ] **Task 3.5**: Replace polling with subscriptions
  - Implementer: [Agent-___] Date: ___
  - File: `src/lib/repositories/ConvexChatRepository.ts`
  - Remove polling loop (lines 196-219)
  - Use Convex subscriptions instead
  - Update to use real-time data
  - Time: 45 minutes

- [ ] **Audit 3.5**: Verify frontend uses subscriptions correctly
  - Auditor: [Agent-___] Date: ___
  - Confirm polling code removed
  - Test real-time updates in UI
  - Verify no performance degradation
  - Check error handling
  - Test connection recovery
  - Measure update latency in UI
  - Document findings: _______________

---

## Phase 4: Integration Testing & Validation (4 hours)
**Must complete after Phase 3**
**All agents participate**

### 4.1 Security Testing Suite
- [ ] **Task 4.1**: Run comprehensive security tests
  - Implementer: [Agent-___] Date: ___
  - Test all 50+ injection vectors:
    - Unicode attacks (fullwidth, zero-width, Cyrillic)
    - Base64 encoded injections
    - HTML/Script injections
    - Template injections
    - System command attempts
    - Role escalation attempts
  - Document results in `tests/results/security.md`
  - Time: 60 minutes

- [ ] **Audit 4.1**: Verify security test coverage
  - Auditor: [Agent-___] Date: ___
  - Review test results
  - Verify 100% block rate
  - Check for any missed vectors
  - Test with new/novel attacks
  - Confirm no false positives
  - Validate test methodology
  - Document findings: _______________

### 4.2 Context Flow Testing
- [ ] **Task 4.2**: Test end-to-end context flow
  - Implementer: [Agent-___] Date: ___
  - Test scenarios:
    - New chat with no history
    - Chat with 100+ messages
    - Stale rolling summary update
    - Context influencing search
    - Search results in generation
  - Document in `tests/results/context-flow.md`
  - Time: 60 minutes

- [ ] **Audit 4.2**: Verify context flow is complete
  - Auditor: [Agent-___] Date: ___
  - Trace full context path
  - Verify context reaches all components
  - Check timing and sequencing
  - Test edge cases
  - Measure context quality
  - Confirm UI shows context
  - Document findings: _______________

### 4.3 Performance Validation
- [ ] **Task 4.3**: Validate performance against baselines
  - Implementer: [Agent-___] Date: ___
  - Measure:
    - Context building time (<100ms target)
    - Search enhancement latency (<50ms added)
    - Real-time update speed (<50ms)
    - Memory usage (<20% increase)
  - Compare to Phase 0 baselines
  - Document in `tests/results/performance.md`
  - Time: 45 minutes

- [ ] **Audit 4.3**: Verify performance meets targets
  - Auditor: [Agent-___] Date: ___
  - Re-run performance tests
  - Verify measurements are accurate
  - Check against baseline documentation
  - Test under load conditions
  - Identify any bottlenecks
  - Document findings: _______________

### 4.4 Type Safety Validation
- [ ] **Task 4.4**: Verify Convex type compliance
  - Implementer: [Agent-___] Date: ___
  - Check:
    - No duplicate type definitions
    - All imports from convexTypes.ts
    - No direct _generated imports (except convexTypes.ts)
    - No manual _id or _creationTime definitions
    - Using Convex validators only
  - Run: `npx tsc --noEmit`
  - Time: 30 minutes

- [ ] **Audit 4.4**: Verify type safety is maintained
  - Auditor: [Agent-___] Date: ___
  - Review all type imports
  - Check for any type duplications
  - Verify Convex patterns followed
  - Test TypeScript compilation
  - Review validator usage
  - Document findings: _______________

### 4.5 Integration Validation
- [ ] **Task 4.5**: Full system integration test
  - Implementer: [Agent-___] Date: ___
  - Test complete user flow:
    1. Create new chat
    2. Send message
    3. Context builds
    4. Search enhances with context
    5. Generation uses context
    6. Rolling summary updates
    7. Real-time updates work
  - Time: 45 minutes

- [ ] **Audit 4.5**: Verify full integration works
  - Auditor: [Agent-___] Date: ___
  - Run through complete flow
  - Check all components interact correctly
  - Verify no errors in console
  - Test error recovery
  - Confirm data consistency
  - Document findings: _______________

---

## Phase 5: Production Preparation (2 hours)
**Final phase - all agents collaborate**

### 5.1 Final Code Review
- [ ] **Task 5.1**: Complete code review
  - Implementer: [Agent-___] Date: ___
  - Review all changes
  - Ensure code quality standards met
  - Verify documentation complete
  - Check test coverage
  - Time: 30 minutes

- [ ] **Audit 5.1**: Meta-audit of entire implementation
  - Auditor: [Agent-___] Date: ___
  - Review all previous audits
  - Verify all issues addressed
  - Check nothing was missed
  - Confirm ready for production
  - Document findings: _______________

### 5.2 Deployment Preparation
- [ ] **Task 5.2**: Prepare for deployment
  - Implementer: [Agent-___] Date: ___
  - Update environment variables
  - Prepare migration scripts
  - Document rollback procedure
  - Create deployment checklist
  - Time: 45 minutes

- [ ] **Audit 5.2**: Verify deployment readiness
  - Auditor: [Agent-___] Date: ___
  - Check all deployment artifacts
  - Verify rollback plan tested
  - Confirm environment configs
  - Review deployment checklist
  - Document findings: _______________

### 5.3 Final Validation
- [ ] **Task 5.3**: Run final validation suite
  - Implementer: [Agent-___] Date: ___
  - Run all tests
  - Verify all metrics met
  - Confirm no regressions
  - Sign off on deployment
  - Time: 45 minutes

- [ ] **Audit 5.3**: Final sign-off
  - Auditor: [Agent-___] Date: ___
  - Verify all success criteria met
  - Confirm all audits completed
  - Check different agents did audits
  - Final approval for deployment
  - Document findings: _______________

---

## Success Criteria Checklist

### Security Metrics
- [ ] 50+ injection vectors tested and blocked (100% block rate)
- [ ] Unicode attacks prevented
- [ ] Scraped content sanitized
- [ ] Rolling summaries secure
- [ ] No system role in schema

### Functionality Metrics
- [ ] Context flows from history to generation
- [ ] Search queries enhanced by context
- [ ] Real-time updates working (<50ms latency)
- [ ] Frontend-backend communication restored
- [ ] No polling loops remaining

### Performance Metrics
- [ ] Context building <100ms
- [ ] Search enhancement <50ms added latency
- [ ] Memory usage <20% increase from baseline
- [ ] All files <500 lines

### Quality Metrics
- [ ] Zero TypeScript errors
- [ ] No Convex type duplications
- [ ] All imports from convexTypes.ts
- [ ] 100% critical path test coverage
- [ ] All tasks audited by different agents

### Audit Compliance
- [ ] Every task has been audited
- [ ] No agent audited their own work
- [ ] All audits include specific findings
- [ ] Issues found were addressed
- [ ] Re-audits completed where needed

---

## Rollback Plan

### Immediate Rollback Triggers
1. Security breach detected
2. >10% increase in error rate
3. Context not flowing to generation
4. Frontend cannot load chats
5. Critical functionality broken

### Rollback Procedure
```bash
# 1. Stop all deployments
npx convex deploy --prod --pause

# 2. Revert to last known good
git checkout main
git reset --hard <last-known-good-commit>

# 3. Restore previous Convex deployment
npx convex deploy --prod <previous-version>

# 4. Clear caches
npm run cache:clear

# 5. Notify team
echo "Rollback initiated at $(date)" >> rollback.log
```

### Post-Rollback Actions
1. Analyze failure logs
2. Identify root cause
3. Fix issues in development
4. Re-test comprehensively
5. Schedule new deployment

---

## Critical Reminders for All Agents

### Type Safety Rules
1. **NEVER** create types that duplicate Convex's auto-generated types
2. **ALWAYS** import from `convex/lib/convexTypes.ts` for types
3. **NEVER** import directly from `_generated/` (except in convexTypes.ts)
4. **NEVER** define `_id`, `_creationTime`, or system fields
5. **ALWAYS** use Convex validators (`v.string()`, `v.number()`, etc.)

### Audit Rules
1. **NEVER** audit your own work
2. **ALWAYS** include specific findings
3. **ALWAYS** test the actual functionality
4. **ALWAYS** check for side effects
5. **ALWAYS** verify Convex compliance

### Communication Rules
1. Mark your agent ID on every task
2. Document any blockers immediately
3. Escalate critical issues
4. Update status in real-time
5. Coordinate at integration points

---

## Final Sign-off Requirements

Before marking complete, verify:

- [ ] All tasks completed by agents
- [ ] All audits completed by different agents
- [ ] All success criteria met
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No security vulnerabilities
- [ ] Performance targets achieved
- [ ] Documentation complete
- [ ] Rollback plan tested
- [ ] Team consensus achieved

**Deployment Authorization:**
- [ ] Technical Lead: [Agent-___] Date: ___
- [ ] Security Reviewer: [Agent-___] Date: ___
- [ ] QA Lead: [Agent-___] Date: ___
- [ ] Final Approval: [Agent-___] Date: ___

---

**END OF CHECKLIST**

Total Tasks: 53 main tasks + 53 audits = 106 items
Estimated Time: 4-5 days with proper parallelization
Required Agents: Minimum 2, optimal 4 for parallel work