import { v } from "convex/values";
import { action } from "./_generated/server";

export const searchWeb = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.maxResults || 5;
    
    // Try SERP API for DuckDuckGo first if available
    if (process.env.SERP_API_KEY) {
      try {
        const serpResults = await searchWithSerpApiDuckDuckGo(args.query, maxResults);
        if (serpResults.length > 0) {
          return {
            results: serpResults,
            searchMethod: 'serp',
            hasRealResults: true
          };
        }
      } catch (error) {
        console.warn("SERP API (DuckDuckGo) failed:", error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      console.log("SERP API key not available, skipping SERP search");
    }
    
    // Try OpenRouter web search as fallback
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const openRouterResults = await searchWithOpenRouter(args.query, maxResults);
        if (openRouterResults.length > 0) {
          return {
            results: openRouterResults,
            searchMethod: 'openrouter',
            hasRealResults: true
          };
        }
      } catch (error) {
        console.warn("OpenRouter search failed:", error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      console.log("OpenRouter API key not available, skipping OpenRouter search");
    }
    
    // Try DuckDuckGo direct API as backup
    try {
      const ddgResults = await searchWithDuckDuckGo(args.query, maxResults);
      if (ddgResults.length > 0) {
        return {
          results: ddgResults,
          searchMethod: 'duckduckgo',
          hasRealResults: ddgResults.some(r => r.relevanceScore > 0.6)
        };
      }
    } catch (error) {
      console.warn("DuckDuckGo search failed:", error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Final fallback - return minimal search links
    const fallbackResults = [{
      title: `Search for: ${args.query}`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
      snippet: "Search results temporarily unavailable. Click to search manually.",
      relevanceScore: 0.3,
    }];
    
    return {
      results: fallbackResults,
      searchMethod: 'fallback',
      hasRealResults: false
    };
  },
});

// SERP API search function using Google engine
async function searchWithSerpApiDuckDuckGo(query: string, maxResults: number): Promise<any[]> {
  const apiUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}&hl=en&gl=us&num=${maxResults}`;
  console.log('SERP API Request:', { query, maxResults });
  const response = await fetch(apiUrl);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('SERP API Error:', response.status, errorText);
    throw new Error(`SERP API returned ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  console.log('SERP API Response:', { hasOrganic: !!data.organic_results, count: data.organic_results?.length || 0 });
  
  if (data.organic_results && data.organic_results.length > 0) {
    return data.organic_results.slice(0, maxResults).map((result: any) => ({
      title: result.title || 'Untitled',
      url: result.link,
      snippet: result.snippet || result.displayed_link || '',
      relevanceScore: 0.9,
    }));
  }
  
  return [];
}

// OpenRouter web search function
async function searchWithOpenRouter(query: string, maxResults: number): Promise<any[]> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "perplexity/llama-3.1-sonar-small-128k-online",
      messages: [
        {
          role: "system",
          content: "You are a web search assistant. Provide factual information with sources. Always cite your sources with URLs."
        },
        {
          role: "user",
          content: `Search for: ${query}. Provide key information with source URLs.`
        }
      ],
      max_tokens: 1000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';
  const annotations = data.choices[0]?.message?.annotations || [];
  
  // Extract URLs from annotations if available
  const results: any[] = [];
  
  if (annotations.length > 0) {
    annotations.forEach((annotation: any, index: number) => {
      if (annotation.type === 'url_citation' && annotation.url_citation) {
        const citation = annotation.url_citation;
        results.push({
          title: citation.title || `Search Result ${index + 1}`,
          url: citation.url,
          snippet: citation.content || content.substring(citation.start_index || 0, citation.end_index || 200),
          relevanceScore: 0.85,
        });
      }
    });
  }
  
  // If no annotations, try to extract URLs from content
  if (results.length === 0 && content) {
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const urls = content.match(urlRegex) || [];
    
    urls.slice(0, maxResults).forEach((url: string, index: number) => {
      results.push({
        title: `Search Result ${index + 1} for: ${query}`,
        url: url,
        snippet: content.substring(0, 200) + '...',
        relevanceScore: 0.75,
      });
    });
  }
  
  return results.slice(0, maxResults);
}

// DuckDuckGo direct API search function
async function searchWithDuckDuckGo(query: string, maxResults: number): Promise<any[]> {
  const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'SearchChat/1.0 (Web Search Assistant)',
    },
  });
  
  if (!response.ok) {
    throw new Error(`DuckDuckGo API returned ${response.status}`);
  }
  
  const data = await response.json();
  let results = [];
  
  // Extract results from DuckDuckGo response
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    results = data.RelatedTopics
      .filter((topic: any) => topic.FirstURL && topic.Text && topic.FirstURL.startsWith('http'))
      .slice(0, maxResults)
      .map((topic: any) => ({
        title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 100),
        url: topic.FirstURL,
        snippet: topic.Text,
        relevanceScore: 0.7,
      }));
  }
  
  // If no results from RelatedTopics, try Abstract
  if (results.length === 0 && data.Abstract && data.AbstractURL) {
    results = [{
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.Abstract,
      relevanceScore: 0.8,
    }];
  }
  
  // Enhanced fallback with better search URLs
  if (results.length === 0) {
    const fallbackSources = [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(query)}`,
        snippet: `Wikipedia search results for "${query}"`,
        relevanceScore: 0.6,
      },
      {
        title: `${query} - Search Results`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: `Web search results for "${query}"`,
        relevanceScore: 0.4,
      }
    ];
    
    results = fallbackSources.slice(0, Math.min(2, maxResults));
  }
  
  return results;
}

export const scrapeUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{
    title: string;
    content: string;
    summary?: string;
  }> => {
    try {
      const response = await fetch(args.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchChat/1.0; Web Content Reader)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error('Not an HTML page');
      }
      
      const html = await response.text();
      
      // Extract title using regex
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      let title = titleMatch ? titleMatch[1].trim() : '';
      
      // Try h1 if no title
      if (!title) {
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        title = h1Match ? h1Match[1].trim() : new URL(args.url).hostname;
      }
      
      // Remove script and style tags, then extract text content
      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      
      // Filter out low-quality content
      if (content.length < 100) {
        throw new Error('Content too short');
      }
      
      // Remove common junk patterns
      const junkPatterns = [
        /cookie policy/gi,
        /accept cookies/gi,
        /privacy policy/gi,
        /terms of service/gi,
        /subscribe to newsletter/gi,
        /follow us on/gi,
        /share this article/gi,
      ];
      
      for (const pattern of junkPatterns) {
        content = content.replace(pattern, '');
      }
      
      // Limit content length
      if (content.length > 5000) {
        content = content.substring(0, 5000) + '...';
      }
      
      // Generate summary (first few sentences)
      const summaryLength = Math.min(500, content.length);
      const summary = content.substring(0, summaryLength) + (content.length > summaryLength ? '...' : '');
      
      return { title, content, summary };
    } catch (error) {
      console.error("Scraping error for", args.url, ":", error);
      return {
        title: new URL(args.url).hostname,
        content: `Unable to fetch content from ${args.url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        summary: `Content unavailable from ${new URL(args.url).hostname}`,
      };
    }
  },
});
