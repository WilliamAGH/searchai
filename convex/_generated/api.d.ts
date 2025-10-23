/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as agents_definitions from "../agents/definitions.js";
import type * as agents_index from "../agents/index.js";
import type * as agents_orchestration from "../agents/orchestration.js";
import type * as agents_tools from "../agents/tools.js";
import type * as auth from "../auth.js";
import type * as chats_anonymous from "../chats/anonymous.js";
import type * as chats_claim from "../chats/claim.js";
import type * as chats_core from "../chats/core.js";
import type * as chats_deletion from "../chats/deletion.js";
import type * as chats_loadMore from "../chats/loadMore.js";
import type * as chats_messages from "../chats/messages.js";
import type * as chats_messagesPaginated from "../chats/messagesPaginated.js";
import type * as chats_migration from "../chats/migration.js";
import type * as chats_subscriptions from "../chats/subscriptions.js";
import type * as chats_summarization from "../chats/summarization.js";
import type * as chats_updates from "../chats/updates.js";
import type * as chats_utils from "../chats/utils.js";
import type * as chats from "../chats.js";
import type * as email from "../email.js";
import type * as enhancements from "../enhancements.js";
import type * as http_cors from "../http/cors.js";
import type * as http_routes_ai from "../http/routes/ai.js";
import type * as http_routes_aiAgent from "../http/routes/aiAgent.js";
import type * as http_routes_publish from "../http/routes/publish.js";
import type * as http_routes_scrape from "../http/routes/scrape.js";
import type * as http_routes_search from "../http/routes/search.js";
import type * as http_utils from "../http/utils.js";
import type * as http from "../http.js";
import type * as lib_id_generator from "../lib/id_generator.js";
import type * as lib_providers_openai from "../lib/providers/openai.js";
import type * as lib_security_patterns from "../lib/security/patterns.js";
import type * as lib_security_sanitization from "../lib/security/sanitization.js";
import type * as lib_security_webContent from "../lib/security/webContent.js";
import type * as lib_url from "../lib/url.js";
import type * as lib_uuid from "../lib/uuid.js";
import type * as lib_validators from "../lib/validators.js";
import type * as messages from "../messages.js";
import type * as migrations_remove_system_role from "../migrations/remove_system_role.js";
import type * as preferences from "../preferences.js";
import type * as search_cache from "../search/cache.js";
import type * as search_executor from "../search/executor.js";
import type * as search_index from "../search/index.js";
import type * as search_metrics from "../search/metrics.js";
import type * as search_planner from "../search/planner.js";
import type * as search_prompts from "../search/prompts.js";
import type * as search_providers_duckduckgo from "../search/providers/duckduckgo.js";
import type * as search_providers_index from "../search/providers/index.js";
import type * as search_providers_openrouter from "../search/providers/openrouter.js";
import type * as search_providers_serpapi from "../search/providers/serpapi.js";
import type * as search_scraper from "../search/scraper.js";
import type * as search_utils from "../search/utils.js";
import type * as search from "../search.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "agents/definitions": typeof agents_definitions;
  "agents/index": typeof agents_index;
  "agents/orchestration": typeof agents_orchestration;
  "agents/tools": typeof agents_tools;
  auth: typeof auth;
  "chats/anonymous": typeof chats_anonymous;
  "chats/claim": typeof chats_claim;
  "chats/core": typeof chats_core;
  "chats/deletion": typeof chats_deletion;
  "chats/loadMore": typeof chats_loadMore;
  "chats/messages": typeof chats_messages;
  "chats/messagesPaginated": typeof chats_messagesPaginated;
  "chats/migration": typeof chats_migration;
  "chats/subscriptions": typeof chats_subscriptions;
  "chats/summarization": typeof chats_summarization;
  "chats/updates": typeof chats_updates;
  "chats/utils": typeof chats_utils;
  chats: typeof chats;
  email: typeof email;
  enhancements: typeof enhancements;
  "http/cors": typeof http_cors;
  "http/routes/ai": typeof http_routes_ai;
  "http/routes/aiAgent": typeof http_routes_aiAgent;
  "http/routes/publish": typeof http_routes_publish;
  "http/routes/scrape": typeof http_routes_scrape;
  "http/routes/search": typeof http_routes_search;
  "http/utils": typeof http_utils;
  http: typeof http;
  "lib/id_generator": typeof lib_id_generator;
  "lib/providers/openai": typeof lib_providers_openai;
  "lib/security/patterns": typeof lib_security_patterns;
  "lib/security/sanitization": typeof lib_security_sanitization;
  "lib/security/webContent": typeof lib_security_webContent;
  "lib/url": typeof lib_url;
  "lib/uuid": typeof lib_uuid;
  "lib/validators": typeof lib_validators;
  messages: typeof messages;
  "migrations/remove_system_role": typeof migrations_remove_system_role;
  preferences: typeof preferences;
  "search/cache": typeof search_cache;
  "search/executor": typeof search_executor;
  "search/index": typeof search_index;
  "search/metrics": typeof search_metrics;
  "search/planner": typeof search_planner;
  "search/prompts": typeof search_prompts;
  "search/providers/duckduckgo": typeof search_providers_duckduckgo;
  "search/providers/index": typeof search_providers_index;
  "search/providers/openrouter": typeof search_providers_openrouter;
  "search/providers/serpapi": typeof search_providers_serpapi;
  "search/scraper": typeof search_scraper;
  "search/utils": typeof search_utils;
  search: typeof search;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
