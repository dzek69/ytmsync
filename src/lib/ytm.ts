import fs from "fs-extra";

interface Item {
    name: string;
    id: string;
}

interface Artist extends Item {}
interface Album extends Item {}

interface Track {
    videoId: string;
    title: string;
    artists: Artist[];
    artist: string;
    album: Album | null;
    duration: string;
}

interface LikesResponse {
    tracks: Track[];
}

class YoutubeMusic {
    public async getLikes() {
        const data = JSON.parse(String(await fs.readFile("./data.txt"))) as LikesResponse;
        data.tracks = data.tracks.map(track => {
            return {
                ...track,
                artist: track.artists[0].name,
            };
        });
        return data;
    }
}

export {
    YoutubeMusic,
};

export type {
    Track,
};
