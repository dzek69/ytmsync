import { compareTwoStrings } from "string-similarity";
import { sortBy } from "bottom-line-utils";

import type { Track } from "./lib/ytm";
import type { ExtendedSongResult, SongMatch } from "./types";

import { CantMatchError, GetTrackError } from "./errors.js";
import { Myzuka } from "./Myzuka.js";
import { LocalFile } from "./LocalFile.js";
import { removeParentheses } from "./utils.js";

const my = new Myzuka();
const local = new LocalFile([
    // "/mnt/c/Downloads/Vivaldi/takeout-20210530T181822Z-001/Takeout/YouTube i YouTube Music/przesłana muzyka/",
    // "/mnt/c/Downloads/ChomikBox",
]);

const isGoodEnough = (input: string, result: number) => {
    if (input.length < 12) {
        return result > 0.75;
    }
    return result > 0.9;
};

const findExact = (track: Track, list: ExtendedSongResult[]) => {
    return list.find(song => {
        return song.artist.toLowerCase() === track.artist.toLowerCase()
            && song.title.toLowerCase() === track.title.toLowerCase()
            && (!track.album || song.album.toLowerCase() === track.album.name.toLowerCase());
    });
};

const getTrack = async (track: Track): Promise<SongMatch> => {
    const localSongs = await local.search({ title: track.title, artist: track.artist, album: track.album?.name || "" });
    const localExact = findExact(track, localSongs);
    if (localExact) {
        return {
            ...localExact,
            matchQuality: "exact",
        };
    }

    let myzukaSongs: ExtendedSongResult[];
    try {
        myzukaSongs = await my.getArtistSongs(track.artist);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    catch (e: unknown) {
        myzukaSongs = [];
    }
    const myzukaExact = findExact(track, myzukaSongs);
    if (myzukaExact) {
        return {
            ...myzukaExact,
            matchQuality: "exact",
        };
    }

    if (!localSongs.length && !myzukaSongs.length) {
        throw new CantMatchError("Could not find track", { track: track, foundTracks: [] });
    }

    const allSongs = [...localSongs, ...myzukaSongs];

    const closeEnough = allSongs.find(song => {
        if (track.album) {
            const albumComparsion = compareTwoStrings(
                removeParentheses(song.album.toLowerCase()), removeParentheses(track.album.name.toLowerCase()),
            );
            if (!isGoodEnough(track.album.name, albumComparsion)) {
                return false;
            }
        }
        const artistComparsion = compareTwoStrings(
            removeParentheses(song.artist.toLowerCase()), removeParentheses(track.artist.toLowerCase()),
        );
        if (!isGoodEnough(track.artist, artistComparsion)) {
            return false;
        }
        const titleComparsion = compareTwoStrings(
            removeParentheses(song.title.toLowerCase()), removeParentheses(track.title.toLowerCase()),
        );
        if (!isGoodEnough(track.title, titleComparsion)) {
            return false;
        }
        return true;
    });

    if (closeEnough) {
        return {
            ...closeEnough,
            matchQuality: "close enough",
        };
    }

    throw new CantMatchError({
        foundTracks: allSongs.map((song) => {
            let totalPossible = 2,
                score = 0;

            if (track.album) {
                totalPossible += 1;
                score += compareTwoStrings(
                    removeParentheses(song.album.toLowerCase()), removeParentheses(track.album.name.toLowerCase()),
                );
            }

            score += compareTwoStrings(
                removeParentheses(song.artist.toLowerCase()), removeParentheses(track.artist.toLowerCase()),
            );
            score += compareTwoStrings(
                removeParentheses(song.title.toLowerCase()), removeParentheses(track.title.toLowerCase()),
            );

            return {
                ...song,
                score: score / totalPossible,
            };
        }).sort(sortBy("score", false)),
        track: track,
    });
};

const askForDownload = async (song: SongMatch, ignoreCache = false): Promise<SongMatch> => {
    if (song.service === "myzuka") {
        return {
            ...await Myzuka.getSongExtendedInfo(song, ignoreCache),
            matchQuality: song.matchQuality,
        };
    }
    throw new Error("Can't get required download info");
};

export {
    getTrack,
    askForDownload,
};
