"""Django views for chatbot interface and API endpoints
:author: William Callahan
"""
import logging
from typing import Any, Literal, cast

from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponseBadRequest,
    HttpResponseServerError,
)
from django.shortcuts import render
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET, require_POST

from .llm_clients import LLMResponseData, get_available_models, get_llm_providers, get_llm_response
from .scraping.orchestration import dispatch_scraping_tasks, update_scraped_results_from_celery
from .services.search import get_default_client

logger = logging.getLogger("agent.chatbot_views")


@require_GET
def chatbot_interface_view(request: HttpRequest) -> HttpResponse:
    """
    Render chatbot interface initialized with search context

    Args:
        request: HTTP request with query_context and optional selected items

    Returns:
        Rendered chatbot interface with initial context

    The view:
    - Initializes chat session with search results
    - Handles selection of specific search results
    - Processes scraping requests for selected items
    - Prepares initial system context for LLM conversation
    """
    query_context = request.GET.get("query_context", "")
    if not query_context:
        return HttpResponseBadRequest(
            b"A search query is required to initialize the chatbot.",
        )

    # Initialize empty chat history in session for this context
    session_key = f"chat_history_{query_context}"
    request.session[session_key] = []

    session_key_results = f"search_raw_results_{query_context}"
    results_list = request.session.get(session_key_results, [])

    selected_params = request.GET.getlist("selected")
    selected_items: list[dict[str, Any]] = []
    include_search_context = False
    if selected_params:
        include_search_context = True
        try:
            indices = [int(i) for i in selected_params if i.isdigit()]
            original_results = request.session.get(session_key_results, [])
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

    scrape_params = request.GET.getlist("scrape_selected")
    scraped_items: list[dict[str, Any]] = []
    include_scrape_context = bool(scrape_params)
    scraping_pending_initial = False
    active_scrape_task_group_id = None

    if include_scrape_context:
        logger.info(f"Processing {len(scrape_params)} scrape_selected items for query '{query_context}'.")
        original_results = request.session.get(session_key_results, [])
        links_to_scrape: list[tuple[str, int]] = []

        for i_str in scrape_params:
            if i_str.isdigit():
                idx = int(i_str)
                if 0 <= idx < len(original_results):
                    link = original_results[idx].get("link")
                    if link:
                        links_to_scrape.append((link, idx))

        if links_to_scrape:
            scraped_items, active_scrape_task_group_id, scraping_pending_initial = dispatch_scraping_tasks(
                request, query_context, links_to_scrape,
            )

    logger.info(f"Initializing chat for '{query_context}' with {len(results_list)} search results, {len(scraped_items)} scraped items. Pending: {scraping_pending_initial}")

    if include_search_context and selected_items:
        context_lines = [
            f"{idx+1}. {item.get('title','No Title')} - {item.get('snippet','')} (Link: {item.get('link','')})"
            for idx, item in enumerate(selected_items)
        ]
        initial_message = (
            "I'll start our conversation using your selected results:\n" + "\n".join(context_lines)
        )
    elif results_list:
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
    else:
        logger.error("No LLM provider configured – cannot load chatbot interface")
        return HttpResponseServerError(
            "LLM provider configuration is missing – please contact support.",
        )
    system_messages = []
    system_message = f"You are a helpful assistant. The user is asking about a topic related to their recent search: '{query_context}'. Keep your answers concise and relevant to this context."
    system_messages.append({"role": "system", "content": system_message})

    if include_search_context and selected_items:
        context_lines = [
            f"{idx+1}. {item.get('title','No Title')} - {item.get('snippet','')} (Link: {item.get('link','')})"
            for idx, item in enumerate(selected_items)
        ]
        search_context_msg = "Here are the selected search results for context:\n" + "\n".join(context_lines)
        system_messages.append({"role": "system", "content": search_context_msg})

    tokens_in_base = sum(len(msg.get("content","")) // 4 + 1 for msg in system_messages)

    scraped_content_tokens = 0
    if scraped_items:
        for item in scraped_items:
            if isinstance(item, dict) and item.get("status") == "success" and item.get("token_count") is not None:
                scraped_content_tokens += item.get("token_count", 0)

    total_initial_tokens_in = tokens_in_base + scraped_content_tokens
    approx_tokens_out = len(initial_message) // 4 + 1
    message_count = len(system_messages) + 1

    base_diag_for_session = {
        "message_count": message_count,
        "tokens_in_base": tokens_in_base,
        "tokens_out": approx_tokens_out,
        "results_count": len(results_list),
        "history_count": 0,
    }
    request.session[f"last_diagnostics_context_{query_context}"] = base_diag_for_session

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
        "include_scrape_context": include_scrape_context,
        "scraped_items": scraped_items,
        "scraping_pending_initial": scraping_pending_initial,
        "active_scrape_task_group_id": active_scrape_task_group_id,
        "message_count": message_count,
        "tokens_in": total_initial_tokens_in,
        "tokens_out": approx_tokens_out,
    }
    return render(request, "agent/partials/chatbot_interface.html", context)


@require_GET
def get_models_for_provider_view(request: HttpRequest) -> HttpResponse:
    """
    Get available models for selected LLM provider

    Args:
        request: HTTP request with provider parameter

    Returns:
        HTML options for available models or error response
    """
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
    """
    Process user message and return LLM response

    Args:
        request: HTTP POST with message, provider, model and context data

    Returns:
        HTML response with user message, bot response and diagnostics

    The view:
    - Processes user message and chat history
    - Optionally adds fresh web search results if requested
    - Checks for completed scraping tasks and adds content
    - Calls LLM API with constructed context
    - Updates session with new history
    - Returns rendered HTML with necessary components
    """
    data = request.POST
    user_message_text = cast(str, data.get("message", "")).strip()
    query_context = data.get("query_context", "")

    if not query_context:
        return HttpResponseBadRequest(b"Chatbot context (original query) is missing.")

    session_key = f"chat_history_{query_context}"
    history: list[dict[str, str]] = request.session.get(session_key, [])
    session_key_results = f"search_raw_results_{query_context}"
    results_list = request.session.get(session_key_results, [])

    if not user_message_text:
        return HttpResponse(status=204)

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

    selected_provider = cast(Literal["openai", "groq"], raw_provider)

    available_models_for_provider = get_available_models(selected_provider)
    if selected_model not in available_models_for_provider:
        error_message = f"Model '{selected_model}' is not valid for provider '{selected_provider}'. Please select a valid model."
        return HttpResponseBadRequest(error_message.encode("utf-8"))

    system_message_content: str = (
        f"You are a helpful assistant. The user is asking about a topic related to "
        f"their recent search: '{query_context}'. Keep your answers concise and "
        f"relevant to this context."
    )

    include_web = data.get("include_web_context") is not None
    web_context_content: str | None = None
    if include_web:
        client = get_default_client()
        if client:
            raw_web = client.search(user_message_text, max_results=5)
            web_results_data = cast(list[dict[str, Any]], raw_web)
        else:
            web_results_data = []
        lines: list[str] = []
        for idx, r in enumerate(web_results_data):
            title = r.get("title", "")
            snippet = r.get("snippet") or r.get("description", "")
            link = r.get("url") or r.get("link", "")
            lines.append(f"{idx+1}. {title} - {snippet} (Link: {link})")
        web_context_content = "Here are fresh web search results for your question:\n" + "\n".join(lines)
        request.session[f"web_results_{query_context}"] = web_results_data

    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system_message_content}]

    active_task_group_id = request.session.get(f"scrape_task_group_id_{query_context}")
    active_task_group_id, still_scraping_some = update_scraped_results_from_celery(
        request, query_context, active_task_group_id,
    )

    prompt_tokens_base = len(system_message_content) // 4 + 1
    if web_context_content:
        prompt_tokens_base += len(web_context_content) // 4 + 1
    for hist_msg in history:
        prompt_tokens_base += len(hist_msg.get("content", "")) // 4 + 1
    prompt_tokens_base += len(user_message_text) // 4 + 1

    scraped_content_for_llm_str = ""
    scraped_results_from_session = request.session.get(f"scraped_results_{query_context}", [])

    valid_scraped_content_lines_for_prompt = []
    if scraped_results_from_session:
        for item in scraped_results_from_session:
            if isinstance(item, dict) and item.get("status") == "success" and item.get("content"):
                truncated_content = item.get("content","")[:1500]
                valid_scraped_content_lines_for_prompt.append(f"- Content from {item.get('link','')}: {truncated_content}")
            elif isinstance(item, dict) and item.get("status") == "pending":
                 valid_scraped_content_lines_for_prompt.append(f"- Scraping for {item.get('link','')} is still in progress.")

        if valid_scraped_content_lines_for_prompt:
            scraped_content_for_llm_str = "User requested scraped content for context:\n" + "\n".join(valid_scraped_content_lines_for_prompt)
            llm_messages.append({"role": "system", "content": scraped_content_for_llm_str})
            prompt_tokens_base += len(scraped_content_for_llm_str) // 4 + 1


    llm_messages += history
    if web_context_content:
        llm_messages.append({"role": "system", "content": web_context_content})
    llm_messages.append({"role": "user", "content": user_message_text})

    # Calculate tokens for logging
    # prompt_tokens_base already calculated earlier
    final_llm_prompt_tokens_check = sum(len(msg.get("content","")) // 4 + 1 for msg in llm_messages)

    logger.info(f"LLM Request for '{query_context}': message_count={len(llm_messages)}, approx_tokens_in_prompt={final_llm_prompt_tokens_check}, history_count={len(history)}, search_results_count={len(results_list)}")

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
        # This is unreachable code as all cases are already covered above

    history.append({"role": "user", "content": user_message_text})
    history.append({"role": "assistant", "content": bot_response_text})
    request.session[session_key] = history

    user_message_html: str = render_to_string(
        "agent/partials/chat_message.html",
        {"message_type": "user", "text": user_message_text},
    )
    bot_message_context = {
        "message_type": "bot",
        "text": bot_response_text,
        "query_context": query_context,
        "groq_tpm_remaining": llm_response_data.get("groq_tpm_remaining"),
        "rate_limit_reset_seconds": llm_response_data.get("retry_after_seconds"),
    }
    bot_response_html: str = render_to_string(
        "agent/partials/chat_message.html",
        bot_message_context,
    )

    approx_tokens_out = len(bot_response_text) // 4 + 1
    logger.info(f"LLM Response for '{query_context}': approx_tokens_out={approx_tokens_out}")

    diag_tokens_in_base = len(system_message_content) // 4 + 1
    if web_context_content:
        diag_tokens_in_base += len(web_context_content) // 4 + 1

    total_successful_scraped_tokens_for_diag = 0
    if scraped_results_from_session:
        for item in scraped_results_from_session:
            if isinstance(item, dict) and item.get("status") == "success":
                total_successful_scraped_tokens_for_diag += item.get("token_count", 0)

    diag_tokens_in_history = 0
    for hist_msg in history:
        diag_tokens_in_history += len(hist_msg.get("content", "")) // 4 + 1

    total_tokens_in_for_diagnostics = diag_tokens_in_base + total_successful_scraped_tokens_for_diag + diag_tokens_in_history

    current_diag_context_for_session = {
        "message_count": len(history) // 2 + 1,
        "tokens_in_base": diag_tokens_in_base + diag_tokens_in_history,
        "tokens_out": approx_tokens_out,
        "results_count": len(results_list),
        "history_count": len(history),
    }
    request.session[f"last_diagnostics_context_{query_context}"] = current_diag_context_for_session

    diagnostics_render_context = {
        "message_count": len(history) // 2 + 1,
        "tokens_in": total_tokens_in_for_diagnostics,
        "tokens_out": approx_tokens_out,
        "results_count": len(results_list),
        "history_count": len(history),
        "query_context": query_context,
        "still_scraping_some": still_scraping_some,
        "active_scrape_task_group_id": active_task_group_id,
    }
    inner_diag = render_to_string("agent/partials/diagnostics.html", diagnostics_render_context)
    diagnostics_html = inner_diag.replace(
        '<div id="diagnostics"',
        '<div id="diagnostics" hx-swap-oob="true"',
    )

    combined_html = diagnostics_html + user_message_html + bot_response_html
    response_triggers = ["clearChatInput", "scrollToBottom"]

    response = HttpResponse(combined_html)
    response["HX-Trigger"] = ", ".join(response_triggers)
    return response
