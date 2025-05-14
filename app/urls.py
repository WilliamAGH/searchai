from django.urls import path # type: ignore
from . import views

urlpatterns = [
    path('hello/', views.hello_view, name='hello'),
]
