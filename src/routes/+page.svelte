<script lang="ts">
    import { onMount } from 'svelte';

    $: subtitles = [];
    $: info = [];

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
        var then = (new Date()).getTime();
        setInterval(() => {
            var lyricsCont = document.querySelectorAll("#lyrics span");
            lyricsCont.forEach((el, i) => {
                var diff = (new Date()).getTime() - then;
                // console.log(diff);
                
                if (parseInt(el.getAttribute("data-timestamp")) > (diff - 10) && parseInt(el.getAttribute("data-timestamp")) < (diff + 10)) {
                    document.querySelectorAll("#lyrics span")[i].style.fontWeight = "bold";
                    if (i !== 0) document.querySelectorAll("#lyrics span")[i-1].style.fontWeight = "normal";
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
    <input required type="text" id="song" placeholder="Song" value="Silence (feat. Khalid)">
    <input type="submit" value="Search">
</form>

<br />

<span id="instrumental"></span>
<span id="explicit"></span>

<ul id="searchResults">
    {#each info as thing, i}
        <li>
            <button on:click={() => parseLyrics(thing.track.track_id)}>
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
        <span data-timestamp={(sub.time.hundredths * 10) + (sub.time.minutes * 60 * 1000) + (sub.time.seconds * 1000)}>{sub.text}</span><br />
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
</style>
