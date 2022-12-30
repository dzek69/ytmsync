WIP

This app will fetch your Youtube Music "Liked Music" playlist and get missing songs to disk.

NOTE:
This app won't get the songs from anywhere by itself. It's up to you to provide method to get the songs.


Prep:

- Install Python >= 3.8
- Go to `py` folder,
- run `pip install ytmusicapi`
- run `python3 init.py`, follow instructions
- run `python3 likes.py > ../data.json`
- run `python3 uploads.py > ../uploads.json`
- prepare cookies file as ~/cookies.txt: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
