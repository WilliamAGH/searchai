"""
URL routing configuration for agent application
:author: William Callahan
"""
from django.urls import path, re_path  # type: ignore

from .chatbot_views import (
    chatbot_interface_view,
    chatbot_send_message_view,
    get_models_for_provider_view,
)
from .scraping.views import check_scraping_status_view, view_scraped_json_result
from .search_views import search_view, view_full_json_result

app_name = "agent"

urlpatterns = [
    path("search/", search_view, name="search"),
    path("chatbot/", chatbot_interface_view, name="chatbot_interface"),
    path("chatbot/send_message/", chatbot_send_message_view, name="chatbot_send_message"),
    path(
        "chatbot/get_models/",
        get_models_for_provider_view,
        name="get_models_for_provider",
    ),
    path(
        "chatbot/scrape_status/",
        check_scraping_status_view,
        name="check_scraping_status",
    ),
    re_path(
        r"^result_json/(?P<query>[^/]+)/(?P<result_index>-?\d+)/$",
        view_full_json_result,
        name="view_full_json_result",
    ),
    re_path(
        r"^scraped_json/(?P<query_context>[^/]+)/(?P<item_index>-?\d+)/$",
        view_scraped_json_result,
        name="view_scraped_json_result",
    ),
]
