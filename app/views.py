
from django.http import HttpResponse # type: ignore

# Create your views here.
def hello_view(request):
    return HttpResponse("Hello, my name is William Callahan!")
