from django.urls import path  # type: ignore

from . import views

app_name = "agent"

urlpatterns = [
    path("search/", views.search_view, name="search"),
    path("chatbot/", views.chatbot_interface_view, name="chatbot_interface"),
    path("chatbot/send_message/", views.chatbot_send_message_view, name="chatbot_send_message"),
    path(
        "chatbot/get_models/",
        views.get_models_for_provider_view,
        name="get_models_for_provider",
    ),
    path(
        "result_json/<str:query>/<int:result_index>/",
        views.view_full_json_result,
        name="view_full_json_result",
    ),
]
