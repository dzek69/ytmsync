import json
from ytmusicapi import YTMusic
ytmusic = YTMusic('headers_auth.json')

pls = ytmusic.get_library_upload_songs(None)

json_object = json.dumps(pls, indent = 4)
print(json_object)
