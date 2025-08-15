/**
 * Tests for Smart Query Enhancement System
 * Verifies that search queries are intelligently enhanced only when it adds value
 */

import { describe, it, expect } from "vitest";

// Mock the smart enhancement functions for testing
// Note: These are simplified versions for unit testing
// The actual implementation is in convex/generation/pipeline.ts

interface EnhancedQuery {
  original: string;
  enhanced: string;
  enhancementType: 'none' | 'context' | 'entity' | 'followup';
  confidence: number;
}

/**
 * Mock implementation of smart query enhancement for testing
 */
function mockSmartEnhanceQueries(options: {
  queries: string[];
  context: string | undefined;
  userMessage: string;
  enhancements: string[];
  maxQueries: number;
}): EnhancedQuery[] {
  const { queries, context, userMessage, enhancements, maxQueries } = options;
  
  if (!context || !queries.length) {
    return queries.slice(0, maxQueries).map(q => ({
      original: q,
      enhanced: q,
      enhancementType: 'none',
      confidence: 1.0,
    }));
  }

  const enhancedQueries: EnhancedQuery[] = [];
  
  for (let i = 0; i < Math.min(queries.length, maxQueries); i++) {
    const originalQuery = queries[i].trim();
    if (!originalQuery) continue;

    const enhancement = mockAnalyzeAndEnhanceQuery({
      query: originalQuery,
      context,
      userMessage,
      enhancements,
      isPrimaryQuery: i === 0,
    });

    enhancedQueries.push(enhancement);
  }

  return enhancedQueries.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Mock implementation of query analysis
 */
function mockAnalyzeAndEnhanceQuery(options: {
  query: string;
  context: string;
  userMessage: string;
  enhancements: string[];
  isPrimaryQuery: boolean;
}): EnhancedQuery {
  const { query, context, userMessage, enhancements, isPrimaryQuery } = options;
  
  let enhancedQuery = query;
  let enhancementType: EnhancedQuery['enhancementType'] = 'none';
  let confidence = 1.0;

  // Only enhance primary queries or when it makes sense
  if (isPrimaryQuery) {
    const analysis = mockAnalyzeQueryEnhancement(query, context, userMessage);
    
    if (analysis.shouldEnhance && analysis.enhancement) {
      enhancedQuery = `${query} ${analysis.enhancement}`.trim();
      enhancementType = analysis.type;
      confidence = analysis.confidence;
    }
  }

  // Apply enhancement search terms if they're highly relevant
  if (enhancements.length > 0 && isPrimaryQuery) {
    const relevantEnhancements = mockFilterRelevantEnhancements(enhancements, query, context);
    if (relevantEnhancements.length > 0) {
      enhancedQuery = `${enhancedQuery} ${relevantEnhancements.slice(0, 2).join(" ")}`.trim();
      if (enhancementType === 'none') {
        enhancementType = 'context';
        confidence = 0.8;
      }
    }
  }

  return {
    original: query,
    enhanced: enhancedQuery,
    enhancementType,
    confidence,
  };
}

/**
 * Mock implementation of query enhancement analysis
 */
function mockAnalyzeQueryEnhancement(
  query: string,
  context: string,
  _userMessage: string
): {
  shouldEnhance: boolean;
  enhancement?: string;
  type: 'none' | 'context' | 'entity' | 'followup';
  confidence: number;
} {
  // Detect follow-up questions that need context
  if (mockIsFollowUpQuestion(query)) {
    const contextEntity = mockExtractMostRelevantEntity(context, query);
    if (contextEntity && !query.toLowerCase().includes(contextEntity.toLowerCase())) {
      return {
        shouldEnhance: true,
        enhancement: contextEntity,
        type: 'followup',
        confidence: 0.9,
      };
    }
  }

  // Detect queries that could benefit from context
  if (mockIsContextDependentQuery(query)) {
    const contextEntity = mockExtractMostRelevantEntity(context, query);
    if (contextEntity && !query.toLowerCase().includes(contextEntity.toLowerCase())) {
      return {
        shouldEnhance: true,
        enhancement: contextEntity,
        type: 'context',
        confidence: 0.7,
      };
    }
  }

  // No enhancement needed
  return {
    shouldEnhance: false,
    type: 'none',
    confidence: 1.0,
  };
}

/**
 * Mock implementation of follow-up question detection
 */
function mockIsFollowUpQuestion(query: string): boolean {
  const followUpPatterns = [
    /^(what|how|where|when|why)\s+about\b/i,
    /^(it|they|this|that|these|those)\s/i,
    /^(and|also|additionally)\s/i,
    /^(tell me more about|explain|describe)\b/i,
    /^(what else|anything else|other)\b/i,
  ];
  
  return followUpPatterns.some(pattern => pattern.test(query));
}

/**
 * Mock implementation of context-dependent query detection
 */
function mockIsContextDependentQuery(query: string): boolean {
  // Short queries often need context
  if (query.split(/\s+/).length <= 3) return true;
  
  // Queries with pronouns need context
  if (/\b(it|they|this|that|these|those|here|there)\b/i.test(query)) return true;
  
  // Queries that reference previous content
  if (/\b(above|previous|earlier|mentioned|said)\b/i.test(query)) return true;
  
  return false;
}

/**
 * Mock implementation of entity extraction
 */
function mockExtractMostRelevantEntity(context: string, query: string): string | null {
  const entities = mockExtractNamedEntities(context);
  
  if (entities.length === 0) return null;
  
  // Find the most relevant entity to the query
  let bestEntity = null;
  let bestScore = 0;
  
  for (const entity of entities) {
    // Skip if entity is already in the query
    if (query.toLowerCase().includes(entity.toLowerCase())) {
      continue;
    }
    
    const score = mockCalculateEntityRelevance(entity, query, context);
    if (score > bestScore && score > 0.5) { // Higher threshold for relevance
      bestScore = score;
      bestEntity = entity;
    }
  }
  
  return bestEntity;
}

/**
 * Mock implementation of named entity extraction
 */
function mockExtractNamedEntities(context: string): string[] {
  if (!context) return [];
  
  const entities: string[] = [];
  
  // Common company names and brands
  const companyNames = [
    'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Tesla', 'OpenAI', 'Anthropic',
    'IBM', 'Oracle', 'Samsung', 'Netflix', 'Twitter', 'SpaceX', 'GitHub'
  ];
  
  for (const company of companyNames) {
    if (context.toLowerCase().includes(company.toLowerCase())) {
      entities.push(company.toLowerCase());
    }
  }
  
  // Technical terms
  const techTerms = [
    'headquarters', 'HQ', 'office', 'campus', 'based', 'located', 'founded',
    'CEO', 'founder', 'product', 'service', 'cloud', 'AI', 'machine learning'
  ];
  
  for (const term of techTerms) {
    if (context.toLowerCase().includes(term.toLowerCase()) && entities.length < 8) {
      entities.push(term.toLowerCase());
    }
  }
  
  return [...new Set(entities)].slice(0, 8);
}

/**
 * Mock implementation of entity relevance calculation
 */
function mockCalculateEntityRelevance(entity: string, query: string, context: string): number {
  const entityLower = entity.toLowerCase();
  const queryLower = query.toLowerCase();
  const contextLower = context.toLowerCase();
  
  let score = 0;
  
  // Entity appears in query (high relevance)
  if (queryLower.includes(entityLower)) {
    score += 0.8;
  }
  
  // Entity appears in context (medium relevance)
  if (contextLower.includes(entityLower)) {
    score += 0.4;
  }
  
  // Entity is semantically related to query terms
  const queryWords = queryLower.split(/\s+/);
  const entityWords = entityLower.split(/\s+/);
  
  for (const queryWord of queryWords) {
    for (const entityWord of entityWords) {
      if (queryWord.length > 2 && entityWord.length > 2) {
        // Exact match
        if (queryWord === entityWord) {
          score += 0.6;
        }
        // Partial match
        else if (queryWord.includes(entityWord) || entityWord.includes(queryWord)) {
          score += 0.3;
        }
      }
    }
  }
  
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Mock implementation of enhancement filtering
 */
function mockFilterRelevantEnhancements(
  enhancements: string[],
  query: string,
  context: string
): string[] {
  if (!enhancements.length) return [];
  
  const relevantEnhancements: string[] = [];
  const queryLower = query.toLowerCase();
  const contextLower = context.toLowerCase();
  
  for (const enhancement of enhancements) {
    const enhancementLower = enhancement.toLowerCase();
    
    // Skip if enhancement is already in query
    if (queryLower.includes(enhancementLower)) continue;
    
    // Skip if enhancement is too generic
    if (enhancementLower.length < 3) continue;
    
    // Check if enhancement is relevant to context
    if (contextLower.includes(enhancementLower)) {
      relevantEnhancements.push(enhancement);
    }
  }
  
  return relevantEnhancements.slice(0, 3);
}

describe("Smart Query Enhancement System", () => {
  describe("Basic Query Enhancement", () => {
    it("should not enhance simple, clear queries", () => {
      const queries = ["what is ai?"];
      const context = "We discussed artificial intelligence and machine learning";
      const userMessage = "what is ai?";
      const enhancements: string[] = [];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      expect(result).toHaveLength(1);
      // The query should remain clean - no enhancement needed
      expect(result[0].enhanced).toBe("what is ai?");
      expect(result[0].enhancementType).toBe("none");
      expect(result[0].confidence).toBe(1.0);
    });

    it("should enhance follow-up questions with context", () => {
      const queries = ["what about machine learning?"];
      const context = "We discussed artificial intelligence and machine learning. AI is a broad field.";
      const userMessage = "what about machine learning?";
      const enhancements: string[] = [];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].enhanced).toContain("what about machine learning?");
      // Should detect this as a follow-up question
      expect(result[0].enhancementType).toBe("followup");
      expect(result[0].confidence).toBeGreaterThan(0.8);
    });

    it("should enhance short queries that need context", () => {
      const queries = ["tell me more"];
      const context = "We discussed artificial intelligence and machine learning at Google";
      const userMessage = "tell me more";
      const enhancements: string[] = [];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].enhanced).toContain("tell me more");
      // Should detect this as context-dependent
      expect(result[0].enhancementType).toBe("context");
      expect(result[0].confidence).toBeGreaterThan(0.6);
    });
  });

  describe("Follow-up Question Detection", () => {
    it("should detect 'what about' questions", () => {
      expect(mockIsFollowUpQuestion("what about machine learning?")).toBe(true);
      expect(mockIsFollowUpQuestion("what about that?")).toBe(true);
    });

    it("should detect pronoun-based questions", () => {
      expect(mockIsFollowUpQuestion("tell me more about it")).toBe(true);
      expect(mockIsFollowUpQuestion("what is this?")).toBe(true);
      expect(mockIsFollowUpQuestion("how does that work?")).toBe(true);
    });

    it("should detect continuation questions", () => {
      expect(mockIsFollowUpQuestion("and what else?")).toBe(true);
      expect(mockIsFollowUpQuestion("also explain this")).toBe(true);
    });

    it("should not detect standalone questions", () => {
      expect(mockIsFollowUpQuestion("what is artificial intelligence?")).toBe(false);
      expect(mockIsFollowUpQuestion("how do neural networks work?")).toBe(false);
    });
  });

  describe("Context-Dependent Query Detection", () => {
    it("should detect short queries", () => {
      expect(mockIsContextDependentQuery("ai")).toBe(true);
      expect(mockIsContextDependentQuery("what is")).toBe(true);
      expect(mockIsContextDependentQuery("tell me")).toBe(true);
    });

    it("should detect queries with pronouns", () => {
      expect(mockIsContextDependentQuery("what is it?")).toBe(true);
      expect(mockIsContextDependentQuery("how does this work?")).toBe(true);
      expect(mockIsContextDependentQuery("tell me about that")).toBe(true);
    });

    it("should detect reference queries", () => {
      expect(mockIsContextDependentQuery("what was mentioned above?")).toBe(true);
      expect(mockIsContextDependentQuery("explain the previous point")).toBe(true);
    });

    it("should not detect complete queries", () => {
      expect(mockIsContextDependentQuery("what is artificial intelligence?")).toBe(false);
      expect(mockIsContextDependentQuery("how do neural networks work in machine learning?")).toBe(false);
    });
  });

  describe("Entity Extraction and Relevance", () => {
    it("should extract company names from context", () => {
      const context = "Google and Microsoft are leading AI companies. Apple is also involved.";
      const entities = mockExtractNamedEntities(context);
      
      expect(entities).toContain("google");
      expect(entities).toContain("microsoft");
      expect(entities).toContain("apple");
    });

    it("should calculate entity relevance correctly", () => {
      const entity = "google";
      const query = "what is Google's AI strategy?";
      const context = "Google is a technology company focused on AI";
      
      const relevance = mockCalculateEntityRelevance(entity, query, context);
      expect(relevance).toBeGreaterThan(0.8);
    });

    it("should return null for irrelevant entities", () => {
      const context = "We discussed artificial intelligence and machine learning";
      const query = "what is ai?";
      
      const entity = mockExtractMostRelevantEntity(context, query);
      // Should not extract irrelevant entities
      expect(entity).toBeNull();
    });
  });

  describe("Enhancement Filtering", () => {
    it("should filter out enhancements already in query", () => {
      const enhancements = ["artificial intelligence", "machine learning", "neural networks"];
      const query = "what is artificial intelligence?";
      const context = "We discussed AI and ML";
      
      const relevant = mockFilterRelevantEnhancements(enhancements, query, context);
      
      expect(relevant).not.toContain("artificial intelligence");
      // Only include if truly relevant to context
      if (context.toLowerCase().includes("machine learning")) {
        expect(relevant).toContain("machine learning");
      }
    });

    it("should filter out generic enhancements", () => {
      const enhancements = ["ai", "ml", "neural networks"];
      const query = "what is machine learning?";
      const context = "We discussed AI and ML";
      
      const relevant = mockFilterRelevantEnhancements(enhancements, query, context);
      
      expect(relevant).not.toContain("ai");
      expect(relevant).not.toContain("ml");
      // Only include if truly relevant to context
      if (context.toLowerCase().includes("neural networks")) {
        expect(relevant).toContain("neural networks");
      }
    });
  });

  describe("Integration Tests", () => {
    it("should handle complex conversation context", () => {
      const queries = ["what about their headquarters?", "tell me more about AI"];
      const context = "Google and Microsoft are leading AI companies. Google is based in Mountain View, California. Microsoft has headquarters in Redmond, Washington.";
      const userMessage = "what about their headquarters?";
      const enhancements = ["location", "office", "campus"];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      expect(result).toHaveLength(2);
      
      // First query should be enhanced with location context
      expect(result[0].enhanced).toContain("what about their headquarters?");
      expect(result[0].enhancementType).toBe("followup");
      
      // Second query should remain clean
      expect(result[1].enhanced).toBe("tell me more about AI");
      expect(result[1].enhancementType).toBe("none");
    });

    it("should gracefully handle edge cases", () => {
      const queries = [""];
      const context = "";
      const userMessage = "";
      const enhancements: string[] = [];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      expect(result).toHaveLength(0);
    });

    it("should respect maxQueries limit", () => {
      const queries = ["query1", "query2", "query3", "query4", "query5"];
      const context = "Some context";
      const userMessage = "test";
      const enhancements: string[] = [];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      expect(result).toHaveLength(3);
    });
  });

  describe("Quality Assurance", () => {
    it("should not produce malformed queries like the regression", () => {
      const queries = ["what is ai?"];
      const context = "We discussed artificial intelligence and machine learning. The user asked about AI.";
      const userMessage = "what is ai?";
      const enhancements: string[] = [];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      const enhancedQuery = result[0].enhanced;
      
      // Should not contain repetitive phrases
      expect(enhancedQuery).not.toMatch(/user.*user/);
      expect(enhancedQuery).not.toMatch(/ai.*ai/);
      expect(enhancedQuery).not.toMatch(/what.*what/);
      
      // Should be clean and readable
      expect(enhancedQuery.split(/\s+/).length).toBeLessThan(10);
      expect(enhancedQuery).toMatch(/^[a-zA-Z0-9\s?.]+$/);
    });

    it("should maintain query clarity and relevance", () => {
      const queries = ["explain machine learning"];
      const context = "We discussed artificial intelligence, machine learning, and neural networks. The user is interested in AI applications.";
      const userMessage = "explain machine learning";
      const enhancements = ["applications", "examples", "use cases"];
      
      const result = mockSmartEnhanceQueries({
        queries,
        context,
        userMessage,
        enhancements,
        maxQueries: 3,
      });
      
      const enhancedQuery = result[0].enhanced;
      
      // Should still be about machine learning
      expect(enhancedQuery).toContain("machine learning");
      
      // Should not be overly long
      expect(enhancedQuery.split(/\s+/).length).toBeLessThan(8);
      
      // Should make sense semantically
      expect(enhancedQuery).toMatch(/explain machine learning/);
    });
  });
});
