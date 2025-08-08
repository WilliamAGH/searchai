import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

export const generateStreamingResponse = action({
  args: {
    chatId: v.id("chats"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    // Add user message to chat
    await ctx.runMutation(api.messages.addMessage, {
      chatId: args.chatId,
      role: "user",
      content: args.message,
    });

    let searchResults: any[] = [];
    let searchContext = "";
    let sources: string[] = [];
    let hasRealResults = false;
    let searchMethod: 'serp' | 'openrouter' | 'duckduckgo' | 'fallback' = 'fallback';
    let errorDetails: string[] = [];

    // Step 1: Search the web
    try {
      console.log('Starting web search for:', args.message);
      const searchResponse = await ctx.runAction(api.search.searchWeb, {
        query: args.message,
        maxResults: 5,
      });

      searchResults = searchResponse.results || [];
      hasRealResults = searchResponse.hasRealResults || false;
      searchMethod = (searchResponse.searchMethod as 'serp' | 'openrouter' | 'duckduckgo' | 'fallback') || 'fallback';
      console.log('Search completed:', { resultsCount: searchResults.length, hasRealResults, searchMethod });

      if (searchResults.length > 0) {
        // Step 2: Scrape content from top results
        const contentPromises = searchResults.slice(0, 3).map(async (result: any, index: number) => {
          try {
            const content = await ctx.runAction(api.search.scrapeUrl, {
              url: result.url,
            });
            sources.push(result.url);
            return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
          } catch (error) {
            errorDetails.push(`Failed to scrape ${result.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return `Source: ${result.title} (${result.url})\n${result.snippet}`;
          }
        });

        const contents = await Promise.all(contentPromises);
        searchContext = contents.join('\n\n');
      }
    } catch (error) {
      console.error('Search failed:', error);
      errorDetails.push(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 3: Generate AI response with adaptive system prompt
    let systemPrompt = `You are a helpful AI assistant. `;
    
    if (hasRealResults && searchContext) {
      systemPrompt += `Use the following search results to inform your response. Cite sources naturally.\n\nSearch Results:\n${searchContext}\n\n`;
    } else if (!hasRealResults && searchResults.length > 0) {
      systemPrompt += `Search results are limited. Provide helpful responses based on your knowledge. `;
    } else {
      systemPrompt += `Web search is unavailable. Provide helpful responses based on your knowledge. `;
    }
    
    systemPrompt += `Provide clear, helpful responses. Format in markdown when appropriate.`;

    let responseContent = "";
    let reasoningTokens = null;

    // Try OpenRouter first
    try {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OpenRouter API key not configured");
      }
      
      console.log('Attempting OpenRouter API call...');
      const openRouterBody = {
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: args.message },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        reasoning: {
          effort: "high",
          exclude: false
        }
      };
      
      console.log('OpenRouter request body:', JSON.stringify(openRouterBody, null, 2));

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(openRouterBody),
      });

      console.log('OpenRouter response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter error response:', errorText);
        errorDetails.push(`OpenRouter API error: HTTP ${response.status}`);
        errorDetails.push(`OpenRouter error details: ${errorText}`);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('OpenRouter response data keys:', Object.keys(data));
      
      const aiMessage = data.choices[0].message;
      responseContent = aiMessage.content || "I apologize, but I couldn't generate a response. Please try again.";
      reasoningTokens = aiMessage.reasoning || null;
      console.log('OpenRouter success, response length:', responseContent.length);

    } catch (openRouterError) {
      console.error("OpenRouter failed, trying Convex OpenAI fallback:", openRouterError);
      errorDetails.push(`OpenRouter failed: ${openRouterError instanceof Error ? openRouterError.message : 'Unknown error'}`);
      
      // Fallback to Convex OpenAI
      try {
        if (!process.env.CONVEX_OPENAI_API_KEY || !process.env.CONVEX_OPENAI_BASE_URL) {
          throw new Error("Convex OpenAI API not configured");
        }
        
        console.log('Attempting Convex OpenAI fallback...');
        const convexOpenAIBody = {
          model: "gpt-4.1-nano",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: args.message },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        };
        
        console.log('Convex OpenAI request body:', JSON.stringify(convexOpenAIBody, null, 2));

        const fallbackResponse = await fetch(`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.CONVEX_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(convexOpenAIBody),
        });

        console.log('Convex OpenAI response status:', fallbackResponse.status);

        if (!fallbackResponse.ok) {
          const fallbackErrorText = await fallbackResponse.text();
          console.error('Convex OpenAI error response:', fallbackErrorText);
          throw new Error(`Convex OpenAI failed: ${fallbackResponse.status} - ${fallbackErrorText}`);
        }

        const fallbackData = await fallbackResponse.json();
        responseContent = fallbackData.choices[0].message.content || "I apologize, but I couldn't generate a response.";
        console.log('Convex OpenAI fallback success, response length:', responseContent.length);
        
      } catch (fallbackError) {
        console.error("Both OpenRouter and Convex OpenAI failed:", fallbackError);
        errorDetails.push(`Convex OpenAI fallback failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        
        // Final fallback - create a helpful response based on search results
        if (searchContext) {
          responseContent = `Based on the search results I found:\n\n${searchContext.substring(0, 1200)}...\n\nI'm having trouble with my AI processing right now, but the above information should help answer your question. Please try again for a more detailed response.`;
        } else {
          responseContent = `I'm having trouble generating a response right now. Here's what happened:\n\n${errorDetails.join('\n')}\n\nPlease try again, or try rephrasing your question.`;
        }
      }
    }

    // Add AI response to chat with metadata
    await ctx.runMutation(api.messages.addMessage, {
      chatId: args.chatId,
      role: "assistant",
      content: responseContent,
      searchResults: searchResults.length > 0 ? searchResults : undefined,
      sources: sources.length > 0 ? sources : undefined,
      reasoning: reasoningTokens,
      searchMethod: searchMethod,
      hasRealResults: hasRealResults,
    });

    return {
      response: responseContent,
      reasoning: reasoningTokens,
      searchResults,
      sources,
    };
  },
});
