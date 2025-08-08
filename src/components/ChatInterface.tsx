import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { SearchProgress } from './SearchProgress';
import { ChatSidebar } from './ChatSidebar';
import { AuthModal } from './AuthModal';
import { ShareModal } from './ShareModal';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface LocalChat {
  _id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isLocal: true;
  shareId?: string;
  isShared?: boolean;
  isPublic?: boolean;
}

interface LocalMessage {
  _id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  searchResults?: any[];
  sources?: string[];
  reasoning?: string;
  searchMethod?: 'serp' | 'openrouter' | 'duckduckgo' | 'fallback';
  hasRealResults?: boolean;
}

export function ChatInterface({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [currentChatId, setCurrentChatId] = useState<Id<"chats"> | string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{
    stage: 'searching' | 'scraping' | 'analyzing' | 'generating';
    message: string;
    urls?: string[];
    currentUrl?: string;
  } | null>(null);
  
  // Local storage for unauthenticated users
  const [localChats, setLocalChats] = useLocalStorage<LocalChat[]>('searchai_chats', []);
  const [localMessages, setLocalMessages] = useLocalStorage<LocalMessage[]>('searchai_messages', []);
  
  const chats = useQuery(api.chats.getUserChats);
  const messages = useQuery(api.chats.getChatMessages,
    currentChatId && typeof currentChatId !== 'string' ? { chatId: currentChatId } : "skip"
  );
  
  const createChat = useMutation(api.chats.createChat);
  const generateResponse = useAction(api.ai.generateStreamingResponse);

  // Generate unique share ID
  const generateShareId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  // Update URL when chat changes
  useEffect(() => {
    if (currentChatId) {
      const shareId = typeof currentChatId === 'string' 
        ? localChats.find(c => c._id === currentChatId)?.shareId
        : null;
      
      if (shareId) {
        const url = new URL(window.location.href);
        url.pathname = `/chat/${shareId}`;
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [currentChatId, localChats]);

  // Check URL for existing chat on load
  useEffect(() => {
    const path = window.location.pathname;
    const chatMatch = path.match(/^\/chat\/([a-zA-Z0-9]+)$/);
    
    if (chatMatch) {
      const shareId = chatMatch[1];
      
      if (!isAuthenticated) {
        // Find local chat by shareId
        const localChat = localChats.find(c => c.shareId === shareId);
        if (localChat) {
          setCurrentChatId(localChat._id);
          return;
        }
      }
      
      // TODO: Handle authenticated user shared chats
    }
  }, [localChats, isAuthenticated]);

  // Get current messages (either from Convex or local storage)
  const currentMessages = React.useMemo(() => {
    if (isAuthenticated && messages) {
      return messages;
    } else if (!isAuthenticated && typeof currentChatId === 'string') {
      return localMessages.filter(msg => msg.chatId === currentChatId);
    }
    return [];
  }, [isAuthenticated, messages, localMessages, currentChatId]);

  // Get all chats (either from Convex or local storage)
  const allChats = React.useMemo(() => {
    if (isAuthenticated && chats) {
      return chats;
    } else if (!isAuthenticated) {
      return localChats;
    }
    return [];
  }, [isAuthenticated, chats, localChats]);

  // Get current chat
  const currentChat = React.useMemo(() => {
    if (typeof currentChatId === 'string') {
      return localChats.find(c => c._id === currentChatId);
    }
    return allChats.find(c => c._id === currentChatId);
  }, [currentChatId, localChats, allChats]);

  const handleNewChat = async () => {
    try {
      if (isAuthenticated) {
        const chatId = await createChat({
          title: "New Chat",
        });
        setCurrentChatId(chatId);
      } else {
        // Create local chat with unique share ID
        const shareId = generateShareId();
        const newChat: LocalChat = {
          _id: `local_${Date.now()}`,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isLocal: true,
          shareId,
        };
        setLocalChats(prev => [newChat, ...prev]);
        setCurrentChatId(newChat._id);
        
        // Update URL immediately
        const url = new URL(window.location.href);
        url.pathname = `/chat/${shareId}`;
        window.history.replaceState({}, '', url.toString());
      }
      setMessageCount(0);
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  // Function to call AI API directly for unauthenticated users
  const generateUnauthenticatedResponse = async (message: string, chatId: string) => {
    let searchResults: any[] = [];
    let searchContext = "";
    let sources: string[] = [];
    let hasRealResults = false;
    let searchMethod: 'serp' | 'openrouter' | 'duckduckgo' | 'fallback' = 'fallback';
    let errorDetails: string[] = [];

    try {
      // Step 1: Search the web
      setSearchProgress({ stage: 'searching', message: 'Searching the web for relevant information...' });

      console.log('🔍 SEARCH API REQUEST:');
      console.log('URL:', '/api/search');
      console.log('Method:', 'POST');
      console.log('Body:', JSON.stringify({ query: message, maxResults: 5 }, null, 2));

      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message, maxResults: 5 })
      });

      console.log('🔍 SEARCH API RESPONSE:');
      console.log('Status:', searchResponse.status);
      console.log('Headers:', Object.fromEntries(searchResponse.headers.entries()));

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log('🔍 SEARCH API RESPONSE BODY:', JSON.stringify(searchData, null, 2));
        
        searchResults = searchData.results || [];
        hasRealResults = searchData.hasRealResults || false;
        searchMethod = searchData.searchMethod || 'fallback';

        if (searchResults.length > 0) {
          setSearchProgress({
            stage: 'scraping',
            message: 'Reading content from top sources...',
            urls: searchResults.slice(0, 3).map(r => r.url)
          });

          // Step 2: Scrape content from top results
          const contentPromises = searchResults.slice(0, 3).map(async (result: any) => {
            setSearchProgress({
              stage: 'scraping',
              message: `Reading content from ${new URL(result.url).hostname}...`,
              currentUrl: result.url,
              urls: searchResults.slice(0, 3).map(r => r.url)
            });

            try {
              console.log('🌐 SCRAPE API REQUEST:');
              console.log('URL:', '/api/scrape');
              console.log('Method:', 'POST');
              console.log('Body:', JSON.stringify({ url: result.url }, null, 2));

              const scrapeResponse = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: result.url })
              });

              console.log('🌐 SCRAPE API RESPONSE:');
              console.log('Status:', scrapeResponse.status);
              console.log('URL:', result.url);

              if (scrapeResponse.ok) {
                const content = await scrapeResponse.json();
                console.log('🌐 SCRAPE API RESPONSE BODY:', JSON.stringify(content, null, 2));
                sources.push(result.url);
                return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
              } else {
                const errorText = await scrapeResponse.text();
                console.error('🌐 SCRAPE API ERROR:', errorText);
                errorDetails.push(`Scraping failed for ${result.url}: HTTP ${scrapeResponse.status}`);
                return `Source: ${result.title} (${result.url})\n${result.snippet}`;
              }
            } catch (error) {
              console.error('🌐 SCRAPE API EXCEPTION:', error);
              errorDetails.push(`Scraping error for ${result.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              return `Source: ${result.title} (${result.url})\n${result.snippet}`;
            }
          });

          const contents = await Promise.all(contentPromises);
          searchContext = contents.join('\n\n');

          setSearchProgress({
            stage: 'analyzing',
            message: 'Analyzing information and generating response...'
          });
        }
      } else {
        const errorText = await searchResponse.text();
        console.error('🔍 SEARCH API ERROR:', errorText);
        errorDetails.push(`Search API failed: HTTP ${searchResponse.status}`);
        errorDetails.push(`Search error details: ${errorText}`);
      }

      setSearchProgress({
        stage: 'generating',
        message: 'AI is thinking and generating response...'
      });

      // Generate AI response
      let systemPrompt = `You are a helpful AI assistant. `;
      
      if (hasRealResults && searchContext) {
        systemPrompt += `Use the following search results to inform your response. Cite sources naturally.\n\nSearch Results:\n${searchContext}\n\n`;
      } else if (!hasRealResults && searchResults.length > 0) {
        systemPrompt += `Search results are limited. Provide helpful responses based on your knowledge. `;
      } else {
        systemPrompt += `Web search is unavailable. Provide helpful responses based on your knowledge. `;
      }
      
      systemPrompt += `Provide clear, helpful responses. Format in markdown when appropriate.`;

      const aiRequestBody = {
        message,
        systemPrompt,
        searchResults,
        sources
      };

      console.log('🤖 AI API REQUEST:');
      console.log('URL:', '/api/ai');
      console.log('Method:', 'POST');
      console.log('Body:', JSON.stringify(aiRequestBody, null, 2));

      const aiResponse = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiRequestBody)
      });

      console.log('🤖 AI API RESPONSE:');
      console.log('Status:', aiResponse.status);
      console.log('Headers:', Object.fromEntries(aiResponse.headers.entries()));

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        console.log('🤖 AI API RESPONSE BODY:', JSON.stringify(aiData, null, 2));
        
        const responseContent = aiData.response || "I apologize, but I couldn't generate a response. Please try again.";
        const reasoningTokens = aiData.reasoning || null;

        // Add AI response to local storage
        const aiMessage: LocalMessage = {
          _id: `msg_${Date.now() + 1}`,
          chatId: chatId,
          role: 'assistant',
          content: responseContent,
          timestamp: Date.now(),
          searchResults: searchResults.length > 0 ? searchResults : undefined,
          sources: sources.length > 0 ? sources : undefined,
          reasoning: reasoningTokens,
          searchMethod: searchMethod,
          hasRealResults: hasRealResults,
        };

        setLocalMessages(prev => [...prev, aiMessage]);
      } else {
        const aiErrorData = await aiResponse.text();
        console.error('🤖 AI API ERROR:', aiErrorData);
        errorDetails.push(`AI API failed: HTTP ${aiResponse.status}`);
        errorDetails.push(`AI error details: ${aiErrorData}`);
        throw new Error(`AI API failed with status ${aiResponse.status}`);
      }
    } catch (error) {
      console.error("❌ AI generation failed:", error);
      
      // Create detailed error message with all the debugging info
      let errorMessage = "I'm having trouble generating a response. Here's the detailed debugging information:\n\n";
      
      errorMessage += "**🔍 SEARCH DEBUG INFO:**\n";
      errorMessage += `- Search Method: ${searchMethod}\n`;
      errorMessage += `- Results Found: ${searchResults.length}\n`;
      errorMessage += `- Real Results: ${hasRealResults ? 'Yes' : 'No'}\n`;
      errorMessage += `- Sources: ${sources.length}\n\n`;
      
      if (errorDetails.length > 0) {
        errorMessage += "**❌ ERROR DETAILS:**\n";
        errorDetails.forEach((detail, index) => {
          errorMessage += `${index + 1}. ${detail}\n`;
        });
        errorMessage += "\n";
      }
      
      errorMessage += "**🌐 ENVIRONMENT CHECK:**\n";
      errorMessage += `- Current URL: ${window.location.href}\n`;
      errorMessage += `- User Agent: ${navigator.userAgent}\n`;
      errorMessage += `- Timestamp: ${new Date().toISOString()}\n\n`;
      
      if (searchContext) {
        errorMessage += "**📄 AVAILABLE CONTENT:**\n";
        errorMessage += searchContext.substring(0, 800) + "...\n\n";
      }
      
      errorMessage += "**🔧 NEXT STEPS:**\n";
      errorMessage += "1. Check browser console for detailed API logs\n";
      errorMessage += "2. Verify API endpoints are accessible\n";
      errorMessage += "3. Try rephrasing your question\n";
      errorMessage += "4. Check network connectivity\n";

      const aiMessage: LocalMessage = {
        _id: `msg_${Date.now() + 1}`,
        chatId: chatId,
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now(),
        searchResults: searchResults.length > 0 ? searchResults : undefined,
        sources: sources.length > 0 ? sources : undefined,
        searchMethod: searchMethod,
        hasRealResults: hasRealResults,
      };

      setLocalMessages(prev => [...prev, aiMessage]);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!currentChatId || isGenerating) return;
    
    // Check message limit for unauthenticated users
    if (!isAuthenticated && messageCount >= 4) {
      setShowAuthModal(true);
      return;
    }
    
    setIsGenerating(true);
    setSearchProgress({ stage: 'searching', message: 'Searching the web...' });
    
    try {
      if (isAuthenticated && typeof currentChatId !== 'string') {
        // Authenticated user - use Convex (without onProgress callback)
        await generateResponse({
          chatId: currentChatId,
          message: content,
        });
      } else {
        // Unauthenticated user - add user message to local storage first
        const userMessage: LocalMessage = {
          _id: `msg_${Date.now()}`,
          chatId: currentChatId as string,
          role: 'user',
          content,
          timestamp: Date.now(),
        };
        
        setLocalMessages(prev => [...prev, userMessage]);
        
        // Update chat title if it's the first message
        if (messageCount === 0) {
          const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
          setLocalChats(prev => prev.map(chat => 
            chat._id === currentChatId 
              ? { ...chat, title, updatedAt: Date.now() }
              : chat
          ));
        }
        
        // Generate real AI response for unauthenticated users
        await generateUnauthenticatedResponse(content, currentChatId as string);
      }
      
      setMessageCount(prev => prev + 1);
    } catch (error) {
      console.error("Failed to generate response:", error);
      
      // Add error message to chat
      const errorMessage: LocalMessage = {
        _id: `msg_${Date.now() + 1}`,
        chatId: currentChatId as string,
        role: 'assistant',
        content: `**Error generating response:**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}\n\nPlease try again or rephrase your question.`,
        timestamp: Date.now(),
      };
      
      if (typeof currentChatId === 'string') {
        setLocalMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsGenerating(false);
      setSearchProgress(null);
    }
  };

  const handleShare = (isPublic: boolean) => {
    if (!currentChat || typeof currentChatId !== 'string') return;
    
    // Update local chat sharing status
    setLocalChats(prev => prev.map(chat => 
      chat._id === currentChatId 
        ? { ...chat, isShared: true, isPublic }
        : chat
    ));
    
    setShowShareModal(false);
  };

  // Auto-create first chat if none exists and not on a shared chat URL
  useEffect(() => {
    const path = window.location.pathname;
    const isSharedChatUrl = path.match(/^\/chat\/[a-zA-Z0-9]+$/);
    
    if (!currentChatId && !isSharedChatUrl) {
      handleNewChat();
    }
  }, [currentChatId]);

  const canShare = currentMessages.length > 0 && typeof currentChatId === 'string';

  return (
    <div className="flex-1 flex">
      <ChatSidebar
        chats={allChats}
        currentChatId={currentChatId}
        onSelectChat={setCurrentChatId}
        onNewChat={handleNewChat}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <div className="flex-1 overflow-hidden">
          <MessageList 
            messages={currentMessages}
            isGenerating={isGenerating}
            searchProgress={searchProgress}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onShare={canShare ? () => setShowShareModal(true) : undefined}
            currentChat={currentChat}
          />
        </div>
        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={isGenerating}
          placeholder={isGenerating ? "AI is working..." : "Ask me anything..."}
        />
      </div>
      
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
      
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShare={handleShare}
        shareUrl={currentChat?.shareId ? `${window.location.origin}/chat/${currentChat.shareId}` : ''}
        isShared={currentChat?.isShared || false}
        isPublic={currentChat?.isPublic || false}
      />
    </div>
  );
}
