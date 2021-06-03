import { Myzuka } from "./Myzuka.js";

const my = new Myzuka();

describe("Myzuka", () => {
    it("searches for songs", async () => {
        const results = await my.searchSong("Children of Bodom Hate me", { extendedInfo: true, limit: 1 });
        results.length.must.equal(1);

        const r = results[0];

        r.artist.must.equal("Children Of Bodom");
        r.title.must.equal("Hate Me!");
        r.album.must.equal("Follow The Reaper");
    }, 60000);

    it("searches for artist", async () => {
        const ra = await my.searchArtist("Rise AgAINst");
        ra.artist.must.equal("Rise Against");
    });

    it("gets artist songs", async () => {
        const songs = await my.getArtistSongs("Rise AgAINst");
        console.log(songs);
        songs.length.must.be.gte(377);
    }, 60000);
});
