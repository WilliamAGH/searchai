"""
Views aggregator for the agent application
:author: William Callahan
"""
# Views have been refactored into specific modules:
# - agent.search_views
# - agent.chatbot_views
# - agent.scraping.views

# This file serves as documentation of the refactoring
# and could be used as an aggregator if needed

# Example aggregator pattern:
# from .search_views import search_view, view_full_json_result
# from .chatbot_views import chatbot_interface_view, get_models_for_provider_view, chatbot_send_message_view
# from .scraping.views import check_scraping_status_view
#
# __all__ = [
#     "search_view", "view_full_json_result",
#     "chatbot_interface_view", "get_models_for_provider_view", "chatbot_send_message_view",
#     "check_scraping_status_view",
# ]
