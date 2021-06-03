import { parseFile } from "music-metadata";
import { basename } from "path";
import { compareTwoStrings } from "string-similarity";
import { makeArray } from "bottom-line-utils";
import recursiveReadDir from "recursive-readdir";
import type { ICommonTagsResult, IFormat } from "music-metadata";

import type { ExtendedSongResult } from "./types";
import { secondsToTime } from "./utils.js";

interface Options { title: string; artist: string; album: string | null}

interface FileData {
    common: ICommonTagsResult;
    format: IFormat;
    path: string;
}

class LocalFile {
    private readonly _path: string[];

    private readonly _files: FileData[];

    private _loaded: boolean;

    public constructor(path: string | string[]) {
        this._path = makeArray(path);
        this._files = [];
        this._loaded = false;
    }

    public async search(query: Options) {
        if (!this._loaded) {
            await this._load();
        }

        return this._files.filter(file => {
            return compareTwoStrings(
                file.common.title?.toLowerCase() || "", query.title.toLowerCase(),
            ) > 0.5 && compareTwoStrings(
                file.common.artist?.toLowerCase() || "", query.artist.toLowerCase(),
            ) > 0.5;
        }).map((file): ExtendedSongResult => {
            return {
                artist: file.common.artist ?? "",
                title: file.common.title ?? "",
                size: "",
                genre: file.common.genre || [],
                time: secondsToTime(file.format.duration || 0),
                album: file.common.album ?? "",
                downloadPath: file.path,
                service: "local",
            };
        });
    }

    private async _load() {
        for (let p = 0; p < this._path.length; p++) {
            const path = this._path[p];

            const list = await recursiveReadDir(path);
            for (let i = 0; i < list.length; i++) {
                const filePath = list[i];
                const item = basename(filePath);

                console.info("Parsing local file", item);
                try {
                    const info = await parseFile(filePath);
                    this._files.push({
                        path: filePath,
                        common: info.common,
                        format: info.format,
                    });
                }
                catch (e: unknown) {
                    if (e instanceof Error && e.message.includes("Guessed MIME-type not supported")) {
                        continue;
                    }
                    console.error("Error during parsing", e);
                }
            }

            this._loaded = true;
        }
    }
}

export {
    LocalFile,
};
