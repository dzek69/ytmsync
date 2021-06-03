interface SongResult {
    artist: string;
    title: string;
    size: string;
    url?: string;
    service: string;
}

interface ExtendedDataTable {
    genre?: string[];
    quality?: string;
    time: string;
    album: string;
}

interface ExtendedInfo extends ExtendedDataTable {
    downloadUrl?: string;
    downloadPath?: string;
}

type ExtendedSongResult = SongResult & ExtendedInfo;
type SongMatch = ExtendedSongResult & {
    matchQuality: string;
};

export type {
    SongResult,
    ExtendedDataTable,
    ExtendedInfo,
    ExtendedSongResult,
    SongMatch,
};
