<script lang="ts">
    import { onMount } from 'svelte';

    $: subtitles = [];
    $: info = [];
    let then = 0;

    async function searchSong(name: string) {
        var response = await fetch(`/api/searchSong?q=${name}`);
        var data = await response.json();
        return data;
    }

    async function getLyrics(id: number) {
        var response = await fetch(`/api/getLyrics?id=${id}`);
        var data = await response.json();
        return data;
    }
    function parseLyrics(id: number) {
        getLyrics(id).then((data) => {
            if (data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR" }];
            }
            subtitles = JSON.parse(data.message.body.subtitle.subtitle_body);
            // console.log(subtitles);
        });
    }

    function playSubtitles() {
        then = (new Date()).getTime();
        setInterval(() => {
            var lyricsCont = document.querySelectorAll("#lyrics button");
            lyricsCont.forEach((el, i) => {
                // console.log(diff);
                var diff = (new Date()).getTime() - then;
                if (parseInt(el.getAttribute("data-timestamp")) > (diff - 10) && parseInt(el.getAttribute("data-timestamp")) < (diff + 10)) {
                    (document.querySelectorAll(".active")).forEach((a, b) => {
                        document.querySelectorAll(".active")[b].classList.remove("active");
                    });
                    el.classList.add("active");
                }
            });
        }, 5);
        
    }

    


    onMount(() => {
        document.getElementById("artistForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            searchSong((<HTMLInputElement>document.getElementById("song"))?.value).then((data) => {
                // console.log(data);
                /* var info = data["message"]["body"]["macro_calls"]["track.lyrics.get"]["message"]["body"]["lyrics"];
                var instrumental = false ? info.instrumental === 0 : true;
                var explicit = false ? info.explicit === 0 : true;

                var instrumentalHTML = document.getElementById("instrumental");
                var explicitHTML = document.getElementById("explicit");

                instrumentalHTML!.innerHTML = `<b>Instrumental</b>: ${instrumental.toString()}<br />`;
                explicitHTML!.innerHTML = `<b>Explicit</b>: ${explicit.toString()}`;

                var lyrics = (info.lyrics_body).replace(/(?:\r\n|\r|\n)/g, '<br>');
                document.getElementById("lyrics")!.innerHTML = lyrics; */
                if (data.message.header.status_code !== 200) {
                    info = [{ track_name: "ERROR" }];
                }
                info = data.message.body.track_list;

            });
        });
    });
</script>

<form id="artistForm">
    <input required type="text" id="song" placeholder="Song">
    <input type="submit" value="Search">
</form>

<br />

<span id="instrumental"></span>
<span id="explicit"></span>

<ul id="searchResults">
    {#each info as thing, i}
        <li>
            <button class="searchButtons" on:click={() => parseLyrics(thing.track.track_id)}>
                <img src={thing.track.album_coverart_100x100} alt="Cover image of {thing.track.track_name}" width="50" height="50">
                <div>
                    <b>{thing.track.track_name}</b>
                    <br />
                    <span>{thing.track.artist_name}</span>
                </div>
            </button>
            
        </li>
    {/each}
</ul>

<button id="playButton" on:click={playSubtitles}>Play</button>

<p id="lyrics">
    {#each subtitles as sub, i}
        <button on:click={() => { then = (new Date()).getTime() - ((sub.time.hundredths * 10) + (sub.time.minutes * 60 * 1000) + (sub.time.seconds * 1000))}} data-timestamp={(sub.time.hundredths * 10) + (sub.time.minutes * 60 * 1000) + (sub.time.seconds * 1000)}>{sub.text}</button><br />
    {/each}
</p>

<style lang="scss">
    #searchResults {
        li, li button {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-left: 0;
    }
    #lyrics button {
        background: transparent;
        border: 0;
        cursor: pointer;
        display: inline;
        color: black;
    }
    :global(.active) {
        font-weight: bold !important;
    }
    .searchButtons {
        padding: .5rem;
        border: 1px solid lightgray;
        background: transparent;
        border-radius: .25rem;
        color: black;
        img {
            border-radius: 5px;
        }
        div {
            text-align: center;
        }
    }
</style>
