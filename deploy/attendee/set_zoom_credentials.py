# Runs inside Attendee: `python manage.py shell < set_zoom_credentials.py`, with ZC_ID and ZC_SECRET in the environment.
# Stores the Zoom app's Client ID and Secret as the Zoom OAuth credentials of the project that MeetMind's API key belongs to
# (the same thing as Settings > Credentials in Attendee's own UI).
import os

from accounts.models import User
from bots.models import Credentials, Project

user = User.objects.get(email="meetmind@localhost")  # created by create_api_key.py
project = Project.objects.filter(organization=user.organization).first()
cred, _ = Credentials.objects.get_or_create(project=project, credential_type=Credentials.CredentialTypes.ZOOM_OAUTH)
cred.set_credentials({"client_id": os.environ["ZC_ID"], "client_secret": os.environ["ZC_SECRET"]})
print("OK: Zoom credentials saved, client id " + cred.get_credentials()["client_id"])
