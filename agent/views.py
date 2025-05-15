import json
import logging
from typing import Any, Literal, cast

from django.http import (  # type: ignore[attr-defined]
    HttpRequest,
    HttpResponse,
    HttpResponseBadRequest,
)
from django.shortcuts import render
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET, require_POST

from .llm_clients import (
    LLMResponseData,
    get_available_models,
    get_llm_providers,
    get_llm_response,
)
from .services.search import get_default_client

logger = logging.getLogger(__name__)


@require_GET
def search_view(request: HttpRequest) -> HttpResponse:
    query: str = cast(str, request.GET.get("q", ""))
    search_results: list[dict[str, Any]] = []
    error_message = None

    if query:
        try:
            client = get_default_client()
            if client:
                # Get organic results for display first (this is safer)
                organic_results = client.search(query, max_results=10)
                raw_results: list[dict[str, Any]] = cast(list[dict[str, Any]], organic_results)

                # Store the organic results in session
                session_key_raw_results = f"search_raw_results_{query}"
                request.session[session_key_raw_results] = raw_results

                # Process search results before attempting to get full response
                search_results = [
                    {
                        "title": r.get("title"),
                        "link": r.get("link"),
                        "snippet": r.get("snippet") or r.get("content") or r.get("description"),
                        "index": idx,
                    }
                    for idx, r in enumerate(raw_results)
                ]

                # Only try to get full response if we have successful organic results
                if search_results:
                    try:
                        # Get full response from Serper API
                        full_response = client.search(query, max_results=10, return_full_response=True)

                        # Store the full API response in session
                        session_key_full_response = f"search_full_response_{query}"
                        request.session[session_key_full_response] = full_response
                    except Exception as e:
                        # Log but don't fail the whole request if full response fails
                        logger.warning(f"Failed to get full API response: {str(e)}")
            else:
                error_message = "Search service client not available."
        except Exception as e:
            error_message = f"An error occurred during search: {str(e)}"
            logger.error(f"Search error for query '{query}': {str(e)}", exc_info=True)

    # Log request info
    logger.info(f"Search request: query='{query}', results={len(search_results)}, error={error_message is not None}")

    if hasattr(request, "htmx") and request.htmx:  # type: ignore[attr-defined]
        logger.debug(f"HTMX request for query: '{query}', results: {len(search_results)}")
        return render(
            request,
            "agent/partials/search_results.html",
            {"results": search_results, "query": query, "error_message": error_message},
        )

    return render(request, "agent/search.html", {"query": query, "results": search_results, "error_message": error_message})


@require_GET
def view_full_json_result(request: HttpRequest, query: str, result_index: int) -> HttpResponse:
    # Convert result_index from string to integer if necessary
    if isinstance(result_index, str):
        try:
            result_index = int(result_index)
        except (TypeError, ValueError):
            return HttpResponseBadRequest("Invalid result index.")
    try:
        # Check if we're displaying the full API response (special case with index -1)
        if result_index == -1:
            # Try to get the full API response first
            session_key_full_response = f"search_full_response_{query}"
            full_response = request.session.get(session_key_full_response)

            if full_response:
                try:
                    # Display the complete Serper API response
                    pretty_json = json.dumps(full_response, indent=2)
                    from django.utils.html import escape
                    pretty_json_escaped = escape(pretty_json)
                    html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto">{pretty_json_escaped}</pre>'
                    return HttpResponse(html_response)
                except Exception as e:
                    logger.error(f"Error processing full API response: {str(e)}", exc_info=True)
                    return HttpResponse(f"Error processing full API response: {str(e)}", status=500)
            else:
                # If full response is not available, show a helpful message
                return HttpResponse(
                    '<div class="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 p-4 border border-yellow-300 dark:border-yellow-700 rounded">'
                    '<p class="font-bold">Full API response is not available</p>'
                    '<p>The complete search API response was not successfully stored in session.</p>'
                    '</div>',
                    status=404,
                )

        # For regular result indexes, show individual organic results
        # Attempt to retrieve individual result from full API response if available
        session_key_full_response = f"search_full_response_{query}"
        full_response = request.session.get(session_key_full_response)
        if full_response is not None:
            # Determine list of items in the full_response
            if isinstance(full_response, list):
                items = full_response
            elif isinstance(full_response, dict) and isinstance(full_response.get("organic"), list):
                items = full_response["organic"]
            else:
                items = None
            # If we have a valid items list and the index is in bounds, show that full JSON
            if items and 0 <= result_index < len(items):
                result_data = items[result_index]
                pretty_json = json.dumps(result_data, indent=2)
                from django.utils.html import escape
                pretty_json_escaped = escape(pretty_json)
                html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto"><b>Full Result JSON:</b>\n{pretty_json_escaped}</pre>'
                return HttpResponse(html_response)
        session_key_raw_results = f"search_raw_results_{query}"
        raw_results_list = request.session.get(session_key_raw_results, [])

        if not raw_results_list or not isinstance(raw_results_list, list):
            return HttpResponse(
                '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
                '<p class="font-bold">No results available</p>'
                '<p>Search results not found in session or have an invalid format.</p>'
                '</div>',
                status=404,
            )

        # Ensure result_index is within bounds
        if not 0 <= result_index < len(raw_results_list):
            return HttpResponse(
                '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
                '<p class="font-bold">Invalid result index</p>'
                f'<p>Result index {result_index} is out of bounds (0-{len(raw_results_list)-1}).</p>'
                '</div>',
                status=404,
            )

        result_data = raw_results_list[result_index]
        pretty_json = json.dumps(result_data, indent=2)
        from django.utils.html import escape
        pretty_json_escaped = escape(pretty_json)
        html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto"><b>Individual Search Result:</b>\n{pretty_json_escaped}</pre>'
        return HttpResponse(html_response)

    except Exception as e:
        # Catch any unexpected errors and log them
        logger.error(f"Unexpected error in view_full_json_result: {str(e)}", exc_info=True)
        return HttpResponse(
            '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
            '<p class="font-bold">Unexpected error</p>'
            f'<p>An error occurred while processing the request: {str(e)}</p>'
            '</div>',
            status=500,
        )


@require_GET
def chatbot_interface_view(request: HttpRequest) -> HttpResponse:
    query_context = request.GET.get("query_context", "")
    if not query_context:
        return HttpResponseBadRequest(
            b"A search query is required to initialize the chatbot.",
        )

    # Initialize empty chat history in session for this context
    session_key = f"chat_history_{query_context}"
    request.session[session_key] = []
    # Log initial context diagnostics (search results count)
    session_key_results = f"search_raw_results_{query_context}"
    results_list = request.session.get(session_key_results, [])
    # Process selected search context if present
    selected_params = request.GET.getlist("selected")
    selected_items: list[dict[str, Any]] = []
    include_search_context = False
    if selected_params:
        include_search_context = True
        try:
            indices = [int(i) for i in selected_params if i.isdigit()]
            session_key_results = f"search_raw_results_{query_context}"
            original_results = request.session.get(session_key_results, [])
            selected_items = []
            for i in indices:
                if 0 <= i < len(original_results):
                    result = original_results[i]
                    selected_items.append({
                        "title": result.get("title", "No Title"),
                        "link": result.get("link", ""),
                        "snippet": result.get("snippet") or result.get("content") or result.get("description", ""),
                    })
        except (ValueError, IndexError):
            selected_items = []
    # Persist selected items for use in the chat send view
    if include_search_context:
        request.session[f"selected_results_{query_context}"] = selected_items
    logger.info(f"Initializing chat for '{query_context}' with {len(results_list)} search results and 0 history messages")

    # Build a conversational initial message based on selected context or search results
    if include_search_context and selected_items:
        # Build detailed context message from selected items
        context_lines = [
            f"{idx+1}. {item.get('title','No Title')} - {item.get('snippet','')} (Link: {item.get('link','')})"
            for idx, item in enumerate(selected_items)
        ]
        initial_message = (
            "I'll start our conversation using your selected results:\n" + "\n".join(context_lines)
        )
    elif results_list:
        # List the top three titles for user selection
        titles = [r.get("title", "No Title") for r in results_list[:3]]
        initial_message = (
            f"I found {len(results_list)} results for '{query_context}'. "
            f"Here are the top entries: {', '.join(titles)}. "
            "Which would you like to explore further?"
        )
    else:
        initial_message = f"No results found for '{query_context}'. What would you like to explore?"

    llm_providers = get_llm_providers()
    default_provider_value = llm_providers[0]["value"] if llm_providers else None
    initial_models: list[str] = []
    typed_provider_value: Literal["openai", "groq"] | None = None

    if default_provider_value == "openai":
        typed_provider_value = "openai"
    elif default_provider_value == "groq":
        typed_provider_value = "groq"

    if typed_provider_value:
        initial_models = get_available_models(typed_provider_value)

    # Calculate token counts for the initial message
    system_messages = []

    # System message with search context
    system_message = f"You are a helpful assistant. The user is asking about a topic related to their recent search: '{query_context}'. Keep your answers concise and relevant to this context."
    system_messages.append({"role": "system", "content": system_message})

    # Add search context if available
    if include_search_context and selected_items:
        context_lines = [
            f"{idx+1}. {item.get('title','No Title')} - {item.get('snippet','')} (Link: {item.get('link','')})"
            for idx, item in enumerate(selected_items)
        ]
        search_context = "Here are the selected search results for context:\n" + "\n".join(context_lines)
        system_messages.append({"role": "system", "content": search_context})

    # Assistant's initial message

    # Calculate tokens
    # IMPORTANT: 1 token is roughly 4 characters for English text
    approx_tokens_in = sum(len(msg.get("content","")) // 4 + 1 for msg in system_messages)
    approx_tokens_out = len(initial_message) // 4 + 1
    message_count = len(system_messages) + 1  # +1 for the assistant's initial message

    context = {
        "query_context": query_context,
        "initial_message": initial_message,
        "llm_providers": llm_providers,
        "initial_models": initial_models,
        "default_provider_value": default_provider_value,
        "results_count": len(results_list),
        "history_count": 0,
        "include_search_context": include_search_context,
        "selected_items": selected_items,
        "message_count": message_count,
        "tokens_in": approx_tokens_in,
        "tokens_out": approx_tokens_out,
    }
    return render(request, "agent/partials/chatbot_interface.html", context)


@require_GET
def get_models_for_provider_view(request: HttpRequest) -> HttpResponse:
    # Support HTMX sending llm_provider as parameter
    provider_param = request.GET.get("llm_provider") or request.GET.get("provider")
    if not provider_param or provider_param not in ["openai", "groq"]:
        return HttpResponseBadRequest(b"Invalid or missing provider.")

    provider = cast(Literal["openai", "groq"], provider_param)
    models = get_available_models(provider)
    options_html_list = [f'<option value="{model}">{model}</option>' for model in models]
    options_html = "".join(options_html_list)
    return HttpResponse(options_html.encode("utf-8"))


@require_POST
def chatbot_send_message_view(request: HttpRequest) -> HttpResponse:
    data = request.POST
    # Explicitly cast to str before stripping to satisfy Pyright
    user_message_text = cast(str, data.get("message", "")).strip()
    query_context = data.get("query_context", "")

    if not query_context:
        # This should ideally not happen if the context is passed correctly from the form
        return HttpResponseBadRequest(b"Chatbot context (original query) is missing.")

    # Retrieve existing chat history for this context
    session_key = f"chat_history_{query_context}"
    history: list[dict[str, str]] = request.session.get(session_key, [])
    # Retrieve stored search results for diagnostics
    session_key_results = f"search_raw_results_{query_context}"
    results_list = request.session.get(session_key_results, [])

    if not user_message_text:
        return HttpResponse(status=204)  # No content to send

    raw_provider = data.get("llm_provider")
    raw_model_value = data.get("llm_model")

    if not raw_provider or raw_provider not in ["openai", "groq"]:
        return HttpResponseBadRequest(b"LLM provider is missing or invalid.")

    selected_model: str
    if isinstance(raw_model_value, str):
        selected_model = raw_model_value.strip()
        if not selected_model:
            return HttpResponseBadRequest(b"LLM model cannot be empty.")
    else:
        return HttpResponseBadRequest(b"LLM model is missing or invalid type.")

    selected_provider = cast(Literal["openai", "groq"], raw_provider)  # noqa: E501

    available_models_for_provider = get_available_models(selected_provider)
    if selected_model not in available_models_for_provider:
        error_message = f"Model '{selected_model}' is not valid for provider '{selected_provider}'. Please select a valid model." # noqa: E501
        return HttpResponseBadRequest(error_message.encode("utf-8"))

    system_message_content: str = (
        f"You are a helpful assistant. The user is asking about a topic related to "
        f"their recent search: '{query_context}'. Keep your answers concise and "
        f"relevant to this context."
    )
    # Handle optional fresh web context if toggled
    include_web = data.get("include_web_context") is not None
    web_context_content: str | None = None
    if include_web:
        client = get_default_client()
        if client:
            raw_web = client.search(user_message_text, max_results=5)
            web_results = cast(list[dict[str, Any]], raw_web)
        else:
            web_results: list[dict[str, Any]] = []
        # Build context string from web results
        lines: list[str] = []
        for idx, r in enumerate(web_results):
            title = r.get("title", "")
            snippet = r.get("snippet") or r.get("description", "")
            link = r.get("url") or r.get("link", "")
            lines.append(f"{idx+1}. {title} - {snippet} (Link: {link})")
        web_context_content = "Here are fresh web search results for your question:\n" + "\n".join(lines)
        # Save web results in session for diagnostics
        request.session[f"web_results_{query_context}"] = web_results

    # Build messages: include system prompt, history, optional web context, then user's message
    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system_message_content}]
    # Include selected search results context if requested
    if data.get("include_search_context"):
        selected_results = request.session.get(f"selected_results_{query_context}", [])
        if selected_results:
            lines = [
                f"{idx+1}. {r.get('title','')} - {r.get('snippet','')} (Link: {r.get('link','')})"
                for idx, r in enumerate(selected_results)
            ]
            search_context_content = "Here are the selected search results for context:\n" + "\n".join(lines)
            llm_messages.append({"role": "system", "content": search_context_content})
    llm_messages += history
    if web_context_content:
        llm_messages.append({"role": "system", "content": web_context_content})
    llm_messages.append({"role": "user", "content": user_message_text})

    # Diagnostics: log message and token counts - using more accurate estimation
    # IMPORTANT: 1 token is roughly 4 characters for English text
    approx_tokens_in = sum(len(msg.get("content","")) // 4 + 1 for msg in llm_messages)
    logger.info(f"LLM Request for '{query_context}': message_count={len(llm_messages)}, approx_tokens_in={approx_tokens_in}, history_count={len(history)}, search_results_count={len(results_list)}")

    llm_response_data: LLMResponseData = get_llm_response(
        provider=selected_provider, model_name=selected_model, messages=llm_messages,
    )

    bot_response_text: str
    error_msg = llm_response_data.get("error_message")
    text_content = llm_response_data.get("text")

    if error_msg:
        bot_response_text = f"Error: {error_msg}"
    elif text_content is None:
        bot_response_text = "Error: Received no text from LLM."
    elif isinstance(text_content, str):
        bot_response_text = text_content
    else:
        bot_response_text = "Error: Unexpected LLM response format."

    # Append this turn to the chat history and save it in session
    history.append({"role": "user", "content": user_message_text})
    history.append({"role": "assistant", "content": bot_response_text})
    request.session[session_key] = history

    # Render the user message with the expected context variables
    user_message_html: str = render_to_string(
        "agent/partials/chat_message.html",
        {"message_type": "user", "text": user_message_text},
    )
    # Prepare context for the bot message, including any rate limit or token info
    bot_message_context = {
        "message_type": "bot",
        "text": bot_response_text,
        # Include original query context for display
        "query_context": query_context,
        # Include Groq-specific and rate-limit info if available
        "groq_tpm_remaining": llm_response_data.get("groq_tpm_remaining"),
        "rate_limit_reset_seconds": llm_response_data.get("retry_after_seconds"),
    }
    bot_response_html: str = render_to_string(
        "agent/partials/chat_message.html",
        bot_message_context,
    )

    # Diagnostics: log approximate output tokens - using more accurate estimation
    # IMPORTANT: 1 token is roughly 4 characters for English text
    approx_tokens_out = len(bot_response_text) // 4 + 1
    logger.info(f"LLM Response for '{query_context}': approx_tokens_out={approx_tokens_out}")

    # Render diagnostics partial
    inner_diag = render_to_string(
        "agent/partials/diagnostics.html",
        {
            "message_count": len(llm_messages),
            "tokens_in": approx_tokens_in,
            "tokens_out": approx_tokens_out,
            "results_count": len(results_list),
            "history_count": len(history),
        },
    )
    # Wrap for HTMX out-of-band swap
    diagnostics_html = inner_diag.replace(
        '<div id="diagnostics"',
        '<div id="diagnostics" hx-swap-oob="true"',
    )
    # Combine diagnostics with chat messages for a single response
    combined_html = diagnostics_html + user_message_html + bot_response_html
    response = HttpResponse(combined_html)
    response["HX-Trigger"] = "clearChatInput, scrollToBottom"
    return response
