import { test, expect, describe, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../convex/_generated/server', () => ({
  httpAction: vi.fn((handler) => handler),
}));

vi.mock('../../convex/http/utils', () => ({
  corsResponse: vi.fn((body, status = 200) => 
    new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  ),
  dlog: vi.fn(),
}));

vi.mock('../../convex/enhancements', () => ({
  applyEnhancements: vi.fn((message) => ({
    enhancedSystemPrompt: 'Enhanced system prompt',
    enhancedContext: 'Enhanced context',
    enhancedQuery: message,
  })),
}));

vi.mock('../../convex/lib/security/sanitization', () => ({
  normalizeSearchResults: vi.fn((results) => 
    Array.isArray(results) ? results.map(r => ({
      ...r,
      relevanceScore: r.relevanceScore ?? 0.5,
    })) : []
  ),
}));

// Mock OpenRouter
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'AI response',
              role: 'assistant',
            },
          }],
        }),
      },
    },
  })),
}));

describe('AI Route Handler', () => {
  let handler: any;
  let mockCtx: any;

  beforeEach(async () => {
    // Import and get the handler
    const module = await import('../../convex/http/routes/ai');
    const mockHttp = {
      route: vi.fn((config) => {
        if (config.path === '/api/ai' && config.method === 'POST') {
          handler = config.handler;
        }
      }),
    };
    module.registerAIRoutes(mockHttp as any);

    // Mock context
    mockCtx = {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      runAction: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/ai', () => {
    test('should reject invalid JSON', async () => {
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await handler(mockCtx, request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
    });

    test('should reject missing message', async () => {
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await handler(mockCtx, request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Message must be a string');
    });

    test('should reject empty message', async () => {
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ message: '   ' }),
      });

      const response = await handler(mockCtx, request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Message is required');
    });

    test('should sanitize message with control characters', async () => {
      const { dlog } = await import('../../convex/http/utils');
      
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Hello\x00World\x1F!' 
        }),
      });

      await handler(mockCtx, request);

      // Check that dlog was called with sanitized message
      expect(dlog).toHaveBeenCalledWith('Message length:', expect.any(Number));
    });

    test('should limit message length', async () => {
      const longMessage = 'a'.repeat(15000);
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: longMessage 
        }),
      });

      await handler(mockCtx, request);

      // Message should be truncated to 10000 chars
      const { dlog } = await import('../../convex/http/utils');
      expect(dlog).toHaveBeenCalledWith('Message length:', 10000);
    });

    test('should handle optional systemPrompt', async () => {
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message',
          systemPrompt: 'Custom system prompt'
        }),
      });

      await handler(mockCtx, request);

      const { dlog } = await import('../../convex/http/utils');
      expect(dlog).toHaveBeenCalledWith('System Prompt length:', 20);
    });

    test('should sanitize and limit sources array', async () => {
      const sources = new Array(30).fill('source-url');
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message',
          sources
        }),
      });

      await handler(mockCtx, request);

      const { dlog } = await import('../../convex/http/utils');
      // Should be limited to 20 sources
      expect(dlog).toHaveBeenCalledWith('Sources count:', 20);
    });

    test('should normalize searchResults', async () => {
      const { normalizeSearchResults } = await import('../../convex/lib/security/sanitization');
      
      const searchResults = [
        { title: 'Result 1', snippet: 'Test', url: 'http://test.com' },
        { title: 'Result 2', snippet: 'Test 2', url: 'http://test2.com' },
      ];

      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message',
          searchResults
        }),
      });

      await handler(mockCtx, request);

      expect(normalizeSearchResults).toHaveBeenCalledWith(searchResults);
    });

    test('should handle chat history', async () => {
      const chatHistory = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
        { role: 'invalid', content: 'Invalid role' }, // Should default to assistant
      ];

      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message',
          chatHistory
        }),
      });

      await handler(mockCtx, request);

      const { dlog } = await import('../../convex/http/utils');
      expect(dlog).toHaveBeenCalledWith('Chat History count:', 3);
    });

    test('should apply enhancements', async () => {
      const { applyEnhancements } = await import('../../convex/enhancements');
      
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message'
        }),
      });

      await handler(mockCtx, request);

      expect(applyEnhancements).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          enhanceQuery: false,
          enhanceSearchTerms: false,
          injectSearchResults: false,
          enhanceContext: true,
          enhanceSystemPrompt: true,
          enhanceResponse: true,
        })
      );
    });

    test('should check environment variables', async () => {
      const { dlog } = await import('../../convex/http/utils');
      
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message'
        }),
      });

      await handler(mockCtx, request);

      // Should log environment variable status
      expect(dlog).toHaveBeenCalledWith(
        '- OPENROUTER_API_KEY:',
        expect.stringMatching(/SET|NOT SET/)
      );
      expect(dlog).toHaveBeenCalledWith(
        '- CONVEX_OPENAI_API_KEY:',
        expect.stringMatching(/SET|NOT SET/)
      );
    });

    test('should validate payload is an object', async () => {
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify('string payload'),
      });

      const response = await handler(mockCtx, request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request payload');
    });

    test('should handle arrays as invalid payload', async () => {
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify([]),
      });

      const response = await handler(mockCtx, request);
      const data = await response.json();

      expect(response.status).toBe(400);
      // Now properly checks for arrays and returns appropriate error
      expect(data.error).toBe('Invalid request payload');
    });

    test('should filter non-string sources', async () => {
      const sources = ['valid-source', 123, null, 'another-source', {}];
      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message',
          sources
        }),
      });

      await handler(mockCtx, request);

      const { dlog } = await import('../../convex/http/utils');
      // Should only count valid string sources
      expect(dlog).toHaveBeenCalledWith('Sources count:', 2);
    });

    test('should limit chat history to 50 messages', async () => {
      const chatHistory = new Array(100).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const request = new Request('http://localhost/api/ai', {
        method: 'POST',
        body: JSON.stringify({ 
          message: 'Test message',
          chatHistory
        }),
      });

      await handler(mockCtx, request);

      const { dlog } = await import('../../convex/http/utils');
      expect(dlog).toHaveBeenCalledWith('Chat History count:', 50);
    });
  });

  describe('OPTIONS /api/ai', () => {
    test('should handle CORS preflight', async () => {
      const mockHttp = {
        route: vi.fn((config) => {
          if (config.path === '/api/ai' && config.method === 'OPTIONS') {
            handler = config.handler;
          }
        }),
      };

      const module = await import('../../convex/http/routes/ai');
      module.registerAIRoutes(mockHttp as any);

      const request = new Request('http://localhost/api/ai', {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      const response = await handler(mockCtx, request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });
  });
});