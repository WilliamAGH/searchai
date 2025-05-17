"""
LLM client interfaces for OpenAI and Groq providers
:author: William Callahan
"""
import contextlib
import os
from typing import Literal, TypedDict

from groq import APIError as GroqAPIError
from groq import Groq
from openai import APIError as OpenAIAPIError
from openai import APIStatusError as OpenAIAPIStatusError
from openai import OpenAI

OPENAI_MODELS: list[str] = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4o-mini-high",
]

GROQ_MODELS: list[str] = [
    "qwen-qwq-32b",
    "gemma2-9b-it",
    "deepseek-r1-distill-llama-70b",
    "compound-beta",
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct"
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "mistral-saba-24b",
]

class LLMResponseData(TypedDict, total=False):
    """
    Type definition for LLM API response data
    
    - Contains response text or error information
    - Includes rate limit details specific to providers
    """
    text: str | None
    error_type: Literal["rate_limit", "api_error", "config_error", "unexpected"] | None
    error_message: str | None
    groq_tpm_remaining: int | None
    groq_tpm_reset_seconds: float | None
    retry_after_seconds: int | None


def get_llm_providers() -> list[dict[str, str]]:
    """
    Returns a list of supported LLM providers with their display names and identifiers.
    
    Each provider is represented as a dictionary containing 'value' (the provider's identifier)
    and 'name' (the human-readable display name).
    """
    return [
        {"value": "openai", "name": "OpenAI"},
        {"value": "groq", "name": "Groq"},
    ]


def get_available_models(provider: Literal["openai", "groq"]) -> list[str]:
    """
    Returns the list of available model names for the specified LLM provider.
    
    Args:
        provider: The identifier of the LLM provider ("openai" or "groq").
    
    Returns:
        A list of model identifiers supported by the given provider. Returns an empty list if the provider is unrecognized.
    """
    if provider == "openai":
        return OPENAI_MODELS
    elif provider == "groq":
        return GROQ_MODELS
    else:
        return []


def _parse_groq_reset_time(reset_string: str | None) -> float | None:
    """
    Converts a Groq rate limit reset time string (e.g., "2m59.56s") to total seconds.
    
    Args:
        reset_string: A string representing the reset time in minutes and seconds, or None.
    
    Returns:
        The total reset time in seconds as a float, or None if parsing fails or input is None.
    """
    if not reset_string:
        return None
    total_seconds = 0.0
    if "m" in reset_string:
        parts = reset_string.split("m", 1)
        with contextlib.suppress(ValueError):
            total_seconds += int(parts[0]) * 60
            reset_string = parts[1]

    if "s" in reset_string:
        with contextlib.suppress(ValueError):
            total_seconds += float(reset_string.rstrip("s"))

    return total_seconds if total_seconds > 0 else None


def get_llm_response(
    provider: Literal["openai", "groq"],
    model_name: str,
    messages: list[dict[str, str]],
) -> LLMResponseData:
    """
    Sends a chat completion request to the specified LLM provider and returns the response or error details.
    
    Args:
        provider: The LLM provider to use ("openai" or "groq").
        model_name: The model identifier to request.
        messages: List of message objects in chat format.
    
    Returns:
        A structured response containing the generated text or error information, including rate limit and retry details when applicable.
    """
    api_key: str | None

    if provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return {"error_type": "config_error", "error_message": "OPENAI_API_KEY not found."}
        client = OpenAI(api_key=api_key)
        try:
            chat_completion = client.chat.completions.create(
                messages=messages,  # type: ignore[arg-type]
                model=model_name,
            )
            response_text = chat_completion.choices[0].message.content
            if response_text is None:
                return {
                    "text": None,
                    "error_type": "api_error",
                    "error_message": "No response content from OpenAI.",
                }
            return {"text": response_text}
        except OpenAIAPIStatusError as e:
            retry_after_openai: int | None = None
            status_code: int = e.status_code
            err_headers: dict = dict(e.response.headers)

            retry_after_str = err_headers.get("retry-after")
            if retry_after_str and retry_after_str.isdigit():
                retry_after_openai = int(retry_after_str)

            if status_code == 429:
                return {
                    "text": None,
                    "error_type": "rate_limit",
                    "error_message": f"OpenAI rate limit: {getattr(e, 'message', str(e))}",
                    "retry_after_seconds": retry_after_openai,
                }
            error_msg_detail = getattr(e, "message", str(e))
            return {
                "text": None,
                "error_type": "api_error",
                "error_message": (
                    f"OpenAI API Error {status_code or 'Unknown'}: {error_msg_detail}"
                ),
            }
        except OpenAIAPIError as e:
            error_message = getattr(e, "message", str(e))
            status_code_generic = getattr(e, "status_code", None)
            retry_after_generic: int | None = None
            err_headers_generic = getattr(e, "headers", None)
            if isinstance(err_headers_generic, dict):
                retry_after_str_generic = err_headers_generic.get("retry-after")
                if retry_after_str_generic and retry_after_str_generic.isdigit():
                    retry_after_generic = int(retry_after_str_generic)

            if status_code_generic == 429:
                return {
                    "text": None,
                    "error_type": "rate_limit",
                    "error_message": f"OpenAI rate limit: {error_message}",
                    "retry_after_seconds": retry_after_generic,
                }
            return {
                "text": None,
                "error_type": "api_error",
                "error_message": (
                    f"OpenAI API Error {status_code_generic or 'Unknown'}: {error_message}"
                ),
            }
        except Exception as e:
            return {
                "text": None,
                "error_type": "unexpected",
                "error_message": f"OpenAI unexpected error: {str(e)}",
            }

    elif provider == "groq":
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return {"error_type": "config_error", "error_message": "GROQ_API_KEY not found."}
        groq_client = Groq(api_key=api_key)
        try:
            api_response = groq_client.chat.completions.with_raw_response.create(
                messages=messages,  # type: ignore[arg-type]
                model=model_name,
            )
            parsed_chat_completion = api_response.parse()
            response_text = parsed_chat_completion.choices[0].message.content

            headers = api_response.headers
            tpm_remaining_str = headers.get("x-ratelimit-remaining-tokens")
            tpm_reset_str = headers.get("x-ratelimit-reset-tokens")

            tpm_remaining = (
                int(tpm_remaining_str)
                if tpm_remaining_str and tpm_remaining_str.isdigit()
                else None
            )
            tpm_reset_seconds = _parse_groq_reset_time(tpm_reset_str)

            if response_text is None:
                return {
                    "text": None,
                    "error_type": "api_error",
                    "error_message": "No response content from Groq.",
                    "groq_tpm_remaining": tpm_remaining,
                    "groq_tpm_reset_seconds": tpm_reset_seconds,
                }
            return {
                "text": response_text,
                "groq_tpm_remaining": tpm_remaining,
                "groq_tpm_reset_seconds": tpm_reset_seconds,
            }
        except GroqAPIError as e:
            retry_after_groq: int | None = None
            tpm_remaining_rl: int | None = None
            tpm_reset_rl: float | None = None
            status_code_rl: int | None = getattr(e, "status_code", None)
            err_headers_rl: dict | None = getattr(e, "headers", None)

            error_msg_template = "Groq API Error {status}: {message}"
            error_msg_detail_rl = getattr(e, "message", str(e))
            error_msg = error_msg_template.format(
                status=status_code_rl or "Unknown",
                message=error_msg_detail_rl,
            )

            if err_headers_rl:
                if status_code_rl == 429:
                    retry_after_str = err_headers_rl.get("retry-after")
                    if retry_after_str and retry_after_str.isdigit():
                        retry_after_groq = int(retry_after_str)
                tpm_remaining_str_rl = err_headers_rl.get("x-ratelimit-remaining-tokens")
                tpm_reset_str_rl = err_headers_rl.get("x-ratelimit-reset-tokens")
                tpm_remaining_rl = (
                    int(tpm_remaining_str_rl)
                    if tpm_remaining_str_rl and tpm_remaining_str_rl.isdigit()
                    else None
                )
                tpm_reset_rl = _parse_groq_reset_time(tpm_reset_str_rl)

            if status_code_rl == 429:
                return {
                    "text": None,
                    "error_type": "rate_limit",
                    "error_message": f"Groq rate limit: {error_msg_detail_rl}",
                    "retry_after_seconds": retry_after_groq,
                    "groq_tpm_remaining": tpm_remaining_rl,
                    "groq_tpm_reset_seconds": tpm_reset_rl,
                }
            return {
                "text": None,
                "error_type": "api_error",
                "error_message": error_msg,
                "groq_tpm_remaining": tpm_remaining_rl,
                "groq_tpm_reset_seconds": tpm_reset_rl,
            }
        except Exception as e:
            return {
                "text": None,
                "error_type": "unexpected",
                "error_message": f"Groq unexpected error: {str(e)}",
            }
    else:
        return {"error_type": "config_error", "error_message": f"Unknown provider '{provider}'."}
