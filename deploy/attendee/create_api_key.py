# Runs inside Attendee: `python manage.py shell < create_api_key.py`.
# Creates (or reuses) a service user for MeetMind, lifts the credit limit of a self-hosted instance
# and prints a new API key on a line starting with API_KEY= (Attendee only stores its hash, so it cannot be read back later).
from accounts.models import Organization, User
from bots.models import ApiKey, Project

user = User.objects.filter(email="meetmind@localhost").first() or User.objects.create(email="meetmind@localhost", is_active=True)
project = Project.objects.filter(organization=user.organization).first()
# Credits are a hosted-billing notion: when they run out Attendee refuses to start bots.
Organization.objects.filter(pk=user.organization_id).update(centicredits=10**9)
_, key = ApiKey.create(project=project, name="meetmind")
print("API_KEY=" + key)
