import fs from "fs-extra";
import slugify from "slugify";
import { ApiClient, ClientHttpError, download } from "api-reach";
import { join } from "path";
import { match, wait } from "bottom-line-utils";
import prompt from "prompts";

import type { Track } from "./lib/ytm.js";
import type { ExtendedSongResult, SongMatch } from "./types";
import { YoutubeMusic } from "./lib/ytm.js";
import { askForDownload, getTrack } from "./getTrack.js";
import { CantMatchError, GetTrackError } from "./errors.js";
import { spawn } from "./lib/spawn.promise.js";

const DIR = "mp3";
const WAIT_BETWEEN_TRACKS = 500;
const ytm = new YoutubeMusic();

const isAlreadyDownloaded = (list: { name: string }[], id: string) => {
    return list.some(file => file.name.includes("." + id + "."));
};

const api = new ApiClient();

const args = process.argv.slice(2);
const FULL_AUTO = args.includes("--full-auto");
const FULL_AUTO_YT = args.includes("--full-auto-yt");
const BAIL = args.includes("--bail");

const getSaveAs = (track: Track) => {
    return slugify(`${track.artist} - ${track.title}`) + `.${track.videoId}.mp3`;
};

// eslint-disable-next-line max-statements,@typescript-eslint/no-floating-promises
(async () => {
    await fs.ensureDir(DIR);
    const list = await Promise.all((await fs.readdir(DIR)).map(async (name) => {
        const stats = await fs.lstat(join(DIR, name));
        return {
            name: name,
            size: stats.size,
        };
    }));
    console.info("ℹ", "There are", list.length, "tracks on disk");
    const { matched: tooSmall, unmatched: existing } = match(list, (i => i.size < 50000));
    if (tooSmall.length) {
        console.info("ℹ", "However", tooSmall.length, "seems damaged and will be removed");
        for (let i = 0; i < tooSmall.length; i++) {
            const item = tooSmall[i];
            await fs.remove(join(DIR, item.name));
            console.info("🗑️", item.name, "removed");
        }
    }

    const likes = await ytm.getLikes();
    const uploads = await ytm.getUploads();
    console.info("ℹ", "There are", likes.tracks.length, "tracks on likes list");
    const failures: Track[] = [];
    // likes.tracks.length = 100;
    for (let i = 0; i < likes.tracks.length; i++) {
        const track = likes.tracks[i];
        if (isAlreadyDownloaded(existing, track.videoId)) {
            console.info("✔", track.artist, track.title, "is already downloaded");
            continue;
        }

        console.info("⬇", track.artist, track.title, track.album?.name, "requires download");
        const saveAs = getSaveAs(track);

        try {
            let foundTrack: SongMatch | null;

            try {
                if (uploads.find(up => up.videoId === track.videoId)) {
                    console.info("This is uploaded song, I will download it back");
                    const path = "tmp/" + slugify(track.videoId) + ".mp3";
                    await spawn("yt-dlp", [
                        `https://music.youtube.com/watch?v=${track.videoId}`,
                        "--format",
                        "bestaudio",
                        "--extract-audio",
                        "--audio-format",
                        "mp3",
                        "--audio-quality",
                        "0",
                        "--cookies", "/home/dzek/cookies.txt",
                        "-o",
                        path,
                    ]);
                    foundTrack = {
                        artist: track.artist,
                        title: track.title,
                        service: "youtube music",
                        size: "",
                        time: track.duration,
                        album: track.album?.name || "",
                        matchQuality: "direct",
                        downloadPath: path,
                    };
                }
                else {
                    if (FULL_AUTO_YT) {
                        throw new CantMatchError("Full auto YT mode, skipping myzuka", {
                            foundTracks: [],
                        });
                    }
                    foundTrack = await getTrack(track);
                }
            }
            catch (e: unknown) {
                if (!(e instanceof CantMatchError)) { // if any other error
                    throw e;
                }
                const foundTracks = e.details!.foundTracks as ExtendedSongResult[];
                if (FULL_AUTO) {
                    throw new GetTrackError("Full auto mode, skipping choices & direct download", {
                        foundTracks,
                        track,
                    });
                }

                let value: ExtendedSongResult | null = null;

                if (foundTracks.length && !FULL_AUTO_YT) {
                    const choices: { title: string; value: ExtendedSongResult | null }[] = foundTracks.map(found => {
                        return {
                            title: `${found.artist} - ${found.title} - ${found.album} - ${found.time}`,
                            value: found,
                        };
                    });
                    choices.unshift({
                        title: "NONE",
                        value: null,
                    });

                    const promptResult: { value: ExtendedSongResult | null } = await prompt({
                        type: "select",
                        name: "value",
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        message: `Pick best match for ${track.artist} - ${track.title} - ${track.album?.name}`
                            + ` - ${track.duration}`,
                        choices: choices,
                    });
                    value = promptResult.value;
                }

                if (!value) {
                    let directly = true;

                    if (!FULL_AUTO_YT) {
                        const choice: { value: boolean } = await prompt({
                            type: "select",
                            name: "value",
                            message: "Do you want to download the song directly from YT Music (with standard quality)?",
                            choices: [
                                { title: "NO", value: false },
                                { title: "YES", value: true },
                            ],
                        });
                        directly = choice.value;
                    }

                    if (!directly) {
                        throw new GetTrackError("No suggested track was right", {
                            foundTracks: [],
                            track: track,
                        });
                    }

                    try {
                        const path = "tmp/" + slugify(track.videoId) + ".mp3";
                        await spawn("yt-dlp", [
                            `https://music.youtube.com/watch?v=${track.videoId}`,
                            "--format",
                            "bestaudio",
                            "--extract-audio",
                            "--audio-format",
                            "mp3",
                            "--audio-quality",
                            "0",
                            "--cookies", "/home/dzek/cookies.txt",
                            "-o",
                            path,
                        ]);
                        foundTrack = {
                            artist: track.artist,
                            title: track.title,
                            service: "youtube music",
                            size: "",
                            time: track.duration,
                            album: track.album?.name || "",
                            matchQuality: "direct",
                            downloadPath: path,
                        };
                    }
                    catch (spawnError: unknown) {
                        throw new GetTrackError("YTM download error", spawnError as Error);
                    }
                }
                else {
                    foundTrack = {
                        ...value,
                        matchQuality: "manual",
                    };
                }
            }

            const fullPath = join(DIR, saveAs);

            if (!foundTrack.downloadUrl && !foundTrack.downloadPath) {
                console.info(
                    "⬇", foundTrack.artist, foundTrack.title,
                    "download source preparing",
                );
                foundTrack = await askForDownload(foundTrack);
            }

            console.info(
                "⬇", "Downloading", foundTrack.artist, foundTrack.title,
                "from", (foundTrack.downloadUrl || foundTrack.downloadPath),
                "with match quality:", foundTrack.matchQuality,
            );

            // @TODO download into tmp file then rename
            if (foundTrack.downloadUrl) {
                try {
                    await download(
                        fs.createWriteStream(fullPath), api, "GET", foundTrack.downloadUrl, null, null, null,
                    );
                }
                catch (e: unknown) {
                    if (e instanceof ClientHttpError && e.message === "Not Found") {
                        console.info(
                            "⬇", "ignoring cache",
                        );
                        foundTrack = await askForDownload(foundTrack, true);
                        console.info(
                            "⬇", "Downloading", foundTrack.artist, foundTrack.title,
                            "from", (foundTrack.downloadUrl || foundTrack.downloadPath),
                            "with match quality:", foundTrack.matchQuality,
                        );
                        await download(
                            fs.createWriteStream(fullPath), api, "GET", foundTrack.downloadUrl!, null, null, null,
                        );
                    }
                    else {
                        throw e;
                    }
                }
            }
            else if (foundTrack.downloadPath) {
                await fs.copy(foundTrack.downloadPath, fullPath);
            }
            else {
                throw new GetTrackError("No url or path for track", { track });
            }
            console.info("✔", track.artist, track.title, "saved to", fullPath);
        }
        catch (e: unknown) {
            if (e instanceof GetTrackError) {
                console.error("👎", track.artist, track.title, e.message, "(" + saveAs + ")");
                console.error("👎", e.details);
                failures.push(track);
            }
            else {
                throw e;
            }

            if (BAIL) {
                throw e;
            }
        }

        await wait(WAIT_BETWEEN_TRACKS);
    }

    console.info("DONE");
    console.info("");
    console.info("Failures:");
    failures.forEach((track) => {
        console.info("👎", track.artist, track.title, "(" + getSaveAs(track) + ")");
    });
    console.info("");
    console.info("DONE");
})();

export {};
