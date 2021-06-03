import cheerio from "cheerio";
import join from "url-join";
import { createError } from "better-custom-error";
import Keyv from "keyv";
import { ApiClient } from "api-reach";
import type { Node as CheerioNode } from "cheerio";

import type { ExtendedDataTable, SongResult, ExtendedSongResult } from "./types";

const MYZUKA_BASE = "https://myzuka.club/";

const MyzukaError = createError("MyzukaError");

const api = new ApiClient({
    // @ts-expect-error api-reach needs to export types
    type: "text",
    base: MYZUKA_BASE,
    cache: new Keyv("sqlite://./cache.sqlite"),
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

class Myzuka {
    public static async getSongExtendedInfo(result: SongResult): Promise<ExtendedSongResult> {
        console.log("GETTING EXTENDED INFO", result.url, result);
        const { body } = await api.get(result.url!);
        const $ = cheerio.load(body);

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
        const { body } = await api.get("/Search", {
            searchText: query,
        });
        const $ = cheerio.load(body);
        const results = $("#artists + * + table > tbody > tr").map((index, el): ArtistResult => {
            const artist = $(el).find("> td:nth-child(2) a").text();
            const url = $(el).find("> td:nth-child(2) a").attr("href")!;

            return {
                artist,
                url,
            };
        }).toArray();

        const theArtist = results.find(r => r.artist.toLowerCase() === query.toLowerCase());
        if (!theArtist) {
            throw new MyzukaError("Can't find artist", { results });
        }
        return theArtist;
    }

    public async getArtistSongs(artist: string): Promise<ExtendedSongResult[]> {
        const foundArtist = await this.searchArtist(artist);
        const songs: ExtendedSongResult[] = [];

        let next: string | undefined = foundArtist.url;
        while (next) {
            const { body } = await api.get(next);
            const $ = cheerio.load(body);
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
        }

        return songs;
    }

    public async searchSong(query: string, options?: SearchSongOptions): Promise<SongResult[] | ExtendedSongResult[]> {
        const { body } = await api.get("/Search", {
            searchText: query,
        });
        const $ = cheerio.load(body);
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
