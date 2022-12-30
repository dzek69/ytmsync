import cheerio from "cheerio";
import join from "url-join";
import { createError } from "better-custom-error";
import Keyv from "keyv";
import { ApiClient } from "api-reach";
import { milli } from "miliseconds";

import type { Options } from "api-reach";
import type { Node as CheerioNode } from "cheerio";

import type { ExtendedDataTable, SongResult, ExtendedSongResult } from "./types";
import { wait } from "bottom-line-utils";
import { removeThe } from "./utils.js";
import { ClientErrorResponse, PossibleResponses } from "api-reach/src/response/response";

const MYZUKA_BASE = "https://myzuka.club/";

const MyzukaError = createError("MyzukaError");

const cache = new Keyv("sqlite://./cache.sqlite", { ttl: milli().months(1).value() });

const api = new ApiClient({
    // @ts-expect-error api-reach needs to export types
    type: "text",
    base: MYZUKA_BASE,
    cache: cache,
    shouldCacheResponse: (response) => {
        if (!(response instanceof Error)) { // any non error can be cached
            console.info("Non error, caching", response.request.url);
            return true;
        }
        console.info("Error, not caching!", response.details?.response.request.url);
        return false;
    },
    fetchOptions: {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                + " (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
        },
    },
});

const artistCache = new Keyv<ExtendedSongResult[]>("sqlite://./cache-artists.sqlite", {
    ttl: milli().days(1).value(),
});

interface SearchSongOptions {
    extendedInfo?: boolean;
    limit?: number;
}

type NodeWithName = CheerioNode & {
    name?: string;
};

interface ArtistResult {
    artist: string;
    url: string;
}

const russianToEnglishMap: { [key: string]: keyof ExtendedDataTable } = {
    Жанр: "genre",
    Альбом: "album",
    Длительность: "time",
};

const russianToSkip = ["Размер", "Рейтинг", "Текст песни", "Загрузил", "Исполнитель"];

const service = "myzuka";

const staticArtists: { [key: string]: string | undefined } = {
    "Ozzy Osbourne": "/Artist/8/ozzy-osbourne",
    "Metalocalypse: Dethklok": "/Artist/4126/Dethklok",
    "Bullet For My Valentine": "/Artist/49/bullet-for-my-valentine",
};

class Myzuka {
    public static async getSongExtendedInfo(result: SongResult, ignoreCache = false): Promise<ExtendedSongResult> {
        const options: Options = {};
        if (ignoreCache) {
            options.cache = null;
        }
        const { body } = await api.get(result.url!, null, options);
        const $ = cheerio.load(body as string);

        const downloadUrl = $(`a[itemprop="audio"][href^="/Song/Download"]`).attr("href");
        if (!downloadUrl) {
            throw new MyzukaError("Can't find download url on", { url: result.url });
        }

        const defaultDataTable: ExtendedDataTable = { album: "", time: "", genre: [] };

        const dataTable = $(".main-details .tbl > table > tbody > tr").toArray().filter((elem) => {
            const tds = elem.children.filter((n: NodeWithName) => n.type === "tag" && n.name === "td");
            return tds.length === 2;
        })
            .map((elem) => {
                const tds = elem.children.filter((n: NodeWithName) => n.type === "tag" && n.name === "td");
                let name = $(tds[0]).text().trim();
                if (name.endsWith(":")) {
                    name = name.substr(0, name.length - 1);
                }
                const skip = russianToSkip.includes(name);
                if (skip) {
                    return;
                }

                name = russianToEnglishMap[name] || ("(unknown)" + name);

                let value: string | string[] = $(tds[1]).text().trim();
                if (name === "genre") {
                    value = value.split("/").map(s => s.trim());
                }
                return {
                    name,
                    value,
                };
            })
            .filter(Boolean)
            .reduce((total, current) => {
                return {
                    ...total,
                    [current!.name]: current!.value,
                };
            }, defaultDataTable);

        return {
            ...result,
            ...dataTable,
            downloadUrl: join(MYZUKA_BASE, downloadUrl),
        };
    }

    public async searchArtist(query: string) {
        if (staticArtists[query]) {
            return {
                artist: query,
                url: staticArtists[query]!,
            };
        }

        const { body } = await api.get("/Search", {
            searchText: query,
        });
        const $ = cheerio.load(body as string);
        const results = $("#artists + * + table > tbody > tr").map((index, el): ArtistResult => {
            const artist = $(el).find("> td:nth-child(2) a").text();
            const url = $(el).find("> td:nth-child(2) a").attr("href")!;

            return {
                artist,
                url,
            };
        }).toArray();

        const theArtist = results.find(r => removeThe(r.artist.toLowerCase()) === removeThe(query.toLowerCase()));
        if (!theArtist) {
            throw new MyzukaError("Can't find artist", { results });
        }
        return theArtist;
    }

    public async getArtistSongs(artist: string): Promise<ExtendedSongResult[]> {
        const cached = await artistCache.get(artist);
        if (cached) {
            return cached;
        }

        const foundArtist = await this.searchArtist(artist);
        const songs: ExtendedSongResult[] = [];

        let next: string | undefined = foundArtist.url;
        try {
            while (next) {
                console.info("Downloading", next);
                const { body } = await api.get(next);
                const $ = cheerio.load(body as string);
                const tracks = $("#result > [itemprop=tracks]").map((index, el): ExtendedSongResult => {
                    let downloadUrl = $(el).find(".play .ico").attr("data-url") || "";
                    if (downloadUrl) {
                        downloadUrl = join(MYZUKA_BASE, downloadUrl);
                    }
                    const [time, quality] = $(el).find(".options .data").text().split("|").map(t => t.trim());
                    const size = $(el).find(".details .time").text();
                    const title = $(el).find(".details p a").text();
                    const url = $(el).find(".details p a").attr("href") || "";
                    const album = $(el).find(".details a[href^='/Album']").text() || "";

                    return {
                        url,
                        downloadUrl,
                        time,
                        quality,
                        artist,
                        title,
                        size,
                        album,
                        service,
                    };
                }).toArray();

                next = $("#result > .pager > ul > li:last-child:not(.current) a").attr("href");

                songs.push(...tracks);
                await wait(5000);
            }
        }
        catch (e) {
            console.error(e);
            throw e;
        }
        await artistCache.set(artist, songs);

        return songs;
    }

    public async searchSong(query: string, options?: SearchSongOptions): Promise<SongResult[] | ExtendedSongResult[]> {
        const { body } = await api.get("/Search", {
            searchText: query,
        });
        const $ = cheerio.load(body as string);
        const result = $("#songs + * + table > tbody > tr").map((index, el): SongResult => {
            const artist = $(el).find("> td:first-child a").text();
            const title = $(el).find("> td:nth-child(2) a").text();
            const size = $(el).find("> td:nth-child(3)").text().trim();

            const url = $(el).find("> td:nth-child(2) a").attr("href")!;

            return {
                artist,
                title,
                size,
                url,
                service,
            };
        }).toArray();

        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        if (options?.limit! < result.length) {
            result.length = options!.limit!;
        }

        if (!options?.extendedInfo) {
            return result;
        }

        for (let i = 0; i < result.length; i++) {
            const item = result[i];
            const info = await Myzuka.getSongExtendedInfo(item);
            Object.assign(item, info);
        }

        return result;
    }
}

export {
    Myzuka,
    MyzukaError,
};

export type {
    SongResult,
};
