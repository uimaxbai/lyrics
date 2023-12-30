<script lang="ts">
    import { onMount } from 'svelte';
    import Switch from './Switch.svelte';

    var apiPrefix = "/api/v1";
    var token = "";
    var autoScroll: boolean;

    $: subtitles = [];
    $: info = [];
    let then = 0;

    async function searchSong(name: string) {
        var response = await fetch(`${apiPrefix}/searchSong?q=${name}&token=${token}`);
        var data = await response.json();
        return data;
    }
    async function getLyrics(id: number) {
        var response = await fetch(`${apiPrefix}/getLyrics?id=${id}&token=${token}`);
        var data = await response.json();
        return data;
    }
    async function getToken() {
        var response = await fetch(`${apiPrefix}/getToken`);
        var data = await response.json();
        if (!response.ok) {
            return false;
        }
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
        var interv = setInterval(() => {
            var lyricsCont = document.querySelectorAll("#lyrics button");
            lyricsCont.forEach((el, i) => {
                // console.log(diff);
                var diff = (new Date()).getTime() - then;
                if (parseInt(el.getAttribute("data-timestamp")) > (diff - 10) && parseInt(el.getAttribute("data-timestamp")) < (diff + 10)) {
                    (document.querySelectorAll(".active")).forEach((a, b) => {
                        document.querySelectorAll(".active")[b].classList.remove("active");
                    });
                    el.classList.add("active");
                    if (i >= lyricsCont.length - 1) {
                        clearInterval(interv);
                    }
                    if (autoScroll) {
                        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center"});
                    }
                }
            });
        }, 5);
        
    }

    


    onMount(() => {
            if (localStorage.getItem("token") === null) {
                getToken().then(data => {
                    token = data.message.body.user_token;
                    // document.getElementById("test")!.innerHTML = token.toString();
                    if (data === false) document.getElementById("submit")!.setAttribute("disabled", "");
                    localStorage.setItem("token", token);
                });
            } else {
                token = localStorage.getItem("token")!;
                // document.getElementById("test")!.innerHTML = token.toString();
            }
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

<svelte:head>
    <title>Live Lyrics</title>
    <meta name="description" content="Live lyrics for free, powered by Musixmatch! Sync to your songs and more...">
</svelte:head>

<form id="artistForm" method="post">
    <div>
        <label for="song"><svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path opacity="1" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></label>
        <input type="search" autocorrect="off" autocapitalize="off" name="song" required id="song" placeholder="Song, lyrics, artist..." spellcheck="false">
    </div>
    <input id="submit" type="submit" value="Search">
</form>

<br />

<!-- <span id="test"></span> -->

<span id="instrumental"></span>
<span id="explicit"></span>

<i>Not what you're looking for? Add the artist into your search</i><br>
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

<div style="display: flex; align-items: center; justify-content: space-between;">
    <button id="playButton" on:click={playSubtitles}><svg xmlns="http://www.w3.org/2000/svg" height="16" width="12" viewBox="0 0 384 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path opacity="1" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>    Play lyrics</button>
    <Switch fontSize={24} bind:value={autoScroll} design="slider" label="Auto-scroll" />
</div>

<p id="lyrics">
    <br>
    <i>Press Play Lyrics before trying to click lyrics</i>
    <i>Click on a lyric to skip to it</i><br>
    {#each subtitles as sub, i}
        <button on:click={() => { then = (new Date()).getTime() - ((sub.time.hundredths * 10) + (sub.time.minutes * 60 * 1000) + (sub.time.seconds * 1000))}} data-timestamp={(sub.time.hundredths * 10) + (sub.time.minutes * 60 * 1000) + (sub.time.seconds * 1000)}>{sub.text}</button><br />
    {/each}
</p>

<style lang="scss">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
    * {
        font-family: 'Outfit', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif!important;
    }
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
        font-size: 1.5em;
        text-align: left;
        margin-left: 0;
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
    #artistForm {
        border-bottom: 1px solid lightgray;
        div {
            align-items: center;
            justify-content: center;
            display: flex;
            gap: .25rem;
        }
        #submit {
            width: 100%;
            border-radius: 0;
            padding: .5rem;
            font-size: 1.1em;
            border: 0;
            color: white;
            background-color: #0873ff;
        }
        svg {
            height: 1.25em;
            margin-left: 1rem;
            width: 1.25em;
        }
    }
    #song {
        margin: 0;
        max-width: 100%;
        overflow: hidden;
        border-radius: 0;
        position: fixed; //  backup
        position: sticky;
        top: 0;
        left: 0;
        border: 0;
        // border-bottom: 1px solid lightgray;
        font-size: 2em;
        outline: 0;
        background: white;
    }
    #searchResults {
        width: 100%;
        margin: 0 .5rem;
        overflow: hidden;
    }
    #playButton, #scrollButton {
        padding: .5rem;
        margin-left: .5rem;
        // aspect-ratio: 1 / 1;
        border-radius: 5px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: .5rem;
        font-size: 1.1em;
        color: black;
        border: 1px solid lightgray;
        margin-top: 1rem;
    }
    #lyrics {
        margin: 0 .25rem;
        width: 100%;
        overflow: hidden;
        button {
            margin: 0;
        }
    }
    @media (prefers-color-scheme: dark) {
        :global(body) {
            background-color: #222;
            color: white;
        }
        #playButton, .searchButtons, #lyrics button, #scrollButton {
            color: white;
        }
        svg {
            // color: white !important;
            filter: invert(100%);
        }
        #song {
            background: #222;
            color: white;
        }
    }
    i {
        margin-left: .5rem;
        display: block;
    }
</style>
