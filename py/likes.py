import json
from ytmusicapi import YTMusic
ytmusic = YTMusic('headers_auth.json')

# pls = ytmusic.get_library_playlists()
# LM = favourites
# PLLqfUXDZOqssUEhFsTuA8ZFFnlFvJV1u4 = Mama
pls = ytmusic.get_playlist("PLLqfUXDZOqssUEhFsTuA8ZFFnlFvJV1u4", None)

json_object = json.dumps(pls, indent = 4)
print(json_object)
