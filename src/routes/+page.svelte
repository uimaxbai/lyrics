<script lang="ts">
    import { onMount } from 'svelte';
    import Switch from './Switch.svelte';

    // Change apiPrefix to an array of potential prefixes
    var apiPrefixes = ["/api/v1"]; // Example prefixes
    var token = "";
    let autoScroll: boolean;
    let isScrolling = false;
    let songValue = "";
    let currentPage = 1;

    let subtitles: any[] = [];
    let lyricsType: 'subtitle' | 'richsync' | null = null;
    type TrackInfo = {
        track: {
            track_id: number;
            track_name: string;
            artist_name: string;
            album_coverart_100x100: string;
        };
    };
    let info: TrackInfo[] = [];
    let then = 0;
    let currentLyricIndex = -1; // Track the currently active lyric index
    let currentWordIndex = -1; // Track the currently active word index within a line
    let playbackIntervalId: ReturnType<typeof setInterval> | null = null; // Declare interval ID variable

    // Helper function to fetch with retry logic for different prefixes
    async function fetchWithRetry(url: string) {
        for (const prefix of apiPrefixes) {
            try {
                const fullUrl = `${prefix}${url}`;
                console.log(`Trying API prefix: ${prefix} for URL: ${url}`); // Optional: for debugging
                const response = await fetch(fullUrl);
                if (!response.ok) {
                    // Handle non-401 errors immediately if needed
                    console.error(`Fetch error for ${fullUrl}: ${response.status} ${response.statusText}`);
                    continue; // Or throw an error depending on desired behavior
                }
                const data = await response.json();
                // Check the specific condition for success (status code not 401)
                if (data?.message?.header?.status_code !== 401) {
                    console.log(`Success with prefix: ${prefix}`); // Optional: for debugging
                    return data; // Return the successful response data
                } else {
                    console.error(`Fetch error for ${fullUrl}: ${response.status} ${response.statusText}`);
                    continue; // Or throw an error depending on desired behavior
                }
                console.log(`Prefix ${prefix} returned 401 or invalid data structure.`); // Optional: for debugging
            } catch (error) {
                console.error(`Error fetching from prefix ${prefix}:`, error);
                // Continue to the next prefix even if fetch itself fails (e.g., network error)
            }
        }
        // If the loop completes without returning, all prefixes failed
        console.error("All API prefixes failed or returned 401.");
        throw new Error("Failed to fetch data from API after trying all prefixes.");
    }

    async function searchSong(name: string, page: number = 1) {
        // Use the fetchWithRetry helper
        return await fetchWithRetry(`/searchSong?q=${name}&token=${token}&page=${page}`);
    }

    async function getLyrics(id: number) {
        // Use the fetchWithRetry helper
        return await fetchWithRetry(`/getLyrics?id=${id}&token=${token}`);
    }

    async function getToken() {
        return await fetchWithRetry(`/getToken`);
    }


    function parseLyrics(id: number) {
        // getLyrics now uses fetchWithRetry
        getLyrics(id).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics" }];
                lyricsType = null;
                return;
            }

            lyricsType = data.type; // Store the type
            console.log(`Lyrics type received: ${lyricsType}`); // Log the type

            if (lyricsType === 'richsync') {
                try {
                    // Richsync body is already JSON
                    subtitles = JSON.parse(data.message.body.richsync.richsync_body);
                    console.log("Raw richsync data:", subtitles);
                    
                    // Verify the expected structure before converting
                    let validStructure = Array.isArray(subtitles) && subtitles.length > 0 && 
                                        typeof subtitles[0].ts === 'number' &&
                                        typeof subtitles[0].te === 'number' &&
                                        Array.isArray(subtitles[0].l);
                                        
                    if (!validStructure) {
                        console.error("Unexpected richsync structure:", subtitles);
                        // Handle unexpected structure by falling back to showing the full line
                        subtitles = subtitles.map(line => ({
                            ...line,
                            ts: typeof line.ts === 'number' ? line.ts * 1000 : 0,
                            te: typeof line.te === 'number' ? line.te * 1000 : 5000,
                            // Create a fake 'l' array if it doesn't exist
                            l: Array.isArray(line.l) ? line.l.map(word => ({
                                ...word,
                                o: typeof word.o === 'number' ? word.o : 0
                            })) : [{ c: line.x || "Unknown", o: 0 }]
                        }));
                    } else {
                        // Convert ts and te from seconds to milliseconds for consistency
                        subtitles = subtitles.map(line => ({
                            ...line,
                            ts: line.ts * 1000,
                            te: line.te * 1000
                        }));
                    }
                    
                    // Log the first line's structure for richsync
                    if (subtitles.length > 0) {
                        console.log("First richsync line structure after processing:", subtitles[0]);
                        console.log(`First line has ${subtitles[0].l?.length || 0} words`);
                        subtitles[0].l?.forEach((word, i) => {
                            console.log(`  Word ${i}: "${word.c}" at offset ${word.o}s`);
                        });
                    }
                } catch (e) {
                    console.error("Error parsing richsync data:", e);
                    subtitles = [{ text: "Error parsing richsync data" }];
                    lyricsType = null;
                }
            } else if (lyricsType === 'subtitle') {
                // Subtitle body needs parsing
                subtitles = JSON.parse(data.message.body.subtitle.subtitle_body);
                // Keep the existing structure { time: { total: number }, text: string }
                // Convert time.total (seconds) to milliseconds
                 subtitles = subtitles.map(line => ({
                    ...line,
                    time: { total: line.time.total * 1000 }
                }));
            } else {
                subtitles = [{ text: "Unknown lyrics format" }];
                 lyricsType = null;
            }
            // console.log("Parsed Lyrics:", subtitles);
            // Reset playback state
            resetPlayback();
            
            // Add a small delay to check if the DOM elements for words are created
            setTimeout(() => {
                if (lyricsType === 'richsync') {
                    const wordElements = document.querySelectorAll('.lyric-word');
                    console.log(`Found ${wordElements.length} .lyric-word elements in DOM`);
                    if (wordElements.length === 0) {
                        console.warn('No word elements found in DOM. Check rendering of richsync lyrics.');
                    } else {
                        console.log('Word elements found. Word-by-word highlighting should work.');
                        // Remove the test highlight code that was adding highlight to first word
                    }
                }
            }, 500);
        }).catch(error => {
            // Handle errors from fetchWithRetry (e.g., all prefixes failed)
            console.error("Error in parseLyrics:", error);
            subtitles = [{ text: "ERROR fetching lyrics after retries" }];
            lyricsType = null;
        });
    }

    function resetPlayback() {
        then = 0;
        currentLyricIndex = -1;
        currentWordIndex = -1; // Reset word index too
        // Clear existing interval if it's running
        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }
        // Remove existing active classes for lines and words
        document.querySelectorAll(".active, .active-word").forEach(el => {
            el.classList.remove("active");
            el.classList.remove("active-word");
        });
    }

    function playLyrics() {
        if (!subtitles || subtitles.length === 0 || !lyricsType) return;

        // Clear any existing interval before starting a new one
        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }

        // Don't resetPlayback() here, as it clears 'then'. 
        // Resetting should happen *before* setting the desired 'then'.
        // resetPlayback(); 

        // REMOVED: then = (new Date()).getTime(); // Start time - This was overwriting the sync time

        // Ensure highlighting is cleared before starting the interval
        document.querySelectorAll(".active, .active-word").forEach(el => {
            el.classList.remove("active");
            el.classList.remove("active-word");
        });
        currentLyricIndex = -1; // Reset index tracking
        currentWordIndex = -1;

        // Use the globally declared playbackIntervalId
        playbackIntervalId = setInterval(() => {
            // ... rest of interval logic remains the same ...
            const now = (new Date()).getTime();
            const diff = now - then; // Time elapsed since playback started

            let newActiveLineIndex = -1;

            // --- Find Active Line ---
            if (lyricsType === 'richsync') {
                newActiveLineIndex = subtitles.findIndex(line => diff >= line.ts && diff < line.te);
            } else if (lyricsType === 'subtitle') {
                 let closestLine = -1;
                 for (let i = 0; i < subtitles.length; i++) {
                     if (subtitles[i].time.total <= diff) {
                         closestLine = i;
                     } else {
                         break;
                     }
                 }
                 newActiveLineIndex = closestLine;
            }

            // --- Handle Line Change ---
            if (newActiveLineIndex !== currentLyricIndex) {
                // Always remove active class from the previous line if there was one
                if (currentLyricIndex !== -1) {
                    const oldLineEl = document.querySelector(`#lyrics [data-index="${currentLyricIndex}"]`);
                    oldLineEl?.classList.remove("active");
                    oldLineEl?.querySelectorAll('.lyric-word').forEach(wordEl => wordEl.classList.remove('active-word'));
                }

                // Add active class to the new line
                if (newActiveLineIndex !== -1) {
                    const newLineEl = document.querySelector(`#lyrics [data-index="${newActiveLineIndex}"]`);
                    newLineEl?.classList.add("active");
                    // Optional: Scroll into view (consider using autoScroll flag)
                    if (autoScroll && !isScrolling) {
                        newLineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
                currentLyricIndex = newActiveLineIndex;
                currentWordIndex = -1; // Reset word index when line changes
            }

            // --- Handle Word Highlighting (Richsync Only) ---
            if (lyricsType === 'richsync' && currentLyricIndex !== -1) {
                const currentLine = subtitles[currentLyricIndex];
                // Ensure currentLine and currentLine.l exist before proceeding
                if (currentLine && currentLine.l) {
                    const timeWithinLine = diff - currentLine.ts;
                    console.log(`Line ${currentLyricIndex}, Time within line: ${timeWithinLine.toFixed(0)}ms`); // Enable this log

                    let newActiveWordIndex = -1;
                    // Find the last word whose offset is less than or equal to the time within the line
                    for (let j = 0; j < currentLine.l.length; j++) {
                        const wordOffsetMs = currentLine.l[j].o * 1000;
                        console.log(`  Word ${j} ('${currentLine.l[j].c}') offset: ${wordOffsetMs.toFixed(0)}ms`); // Enable this log
                        if (wordOffsetMs <= timeWithinLine) {
                            newActiveWordIndex = j;
                        } else {
                            break; // Words are ordered by offset
                        }
                    }
                    console.log(`  New active word index: ${newActiveWordIndex}`); // Enable this log

                    if (newActiveWordIndex !== currentWordIndex) {
                        console.log(`  Updating word highlight: Old=${currentWordIndex}, New=${newActiveWordIndex}`); // Enable this log
                        
                        // Remove active class from previous word
                        if (currentWordIndex !== -1) {
                            const oldWordEl = document.querySelector(`.lyric-word[data-line-index="${currentLyricIndex}"][data-word-index="${currentWordIndex}"]`);
                            if (oldWordEl) {
                                console.log('Removing highlight from word:', oldWordEl.textContent);
                                oldWordEl.classList.remove('active-word');
                            } else {
                                console.warn(`Could not find previous word element: line ${currentLyricIndex}, word ${currentWordIndex}`);
                            }
                        }
                        
                        // Add active class to new word
                        if (newActiveWordIndex !== -1) {
                            const newWordEl = document.querySelector(`.lyric-word[data-line-index="${currentLyricIndex}"][data-word-index="${newActiveWordIndex}"]`);
                            if (newWordEl) {
                                console.log('Adding highlight to word:', newWordEl.textContent);
                                newWordEl.classList.add('active-word');
                            } else {
                                console.warn(`Could not find new word element: line ${currentLyricIndex}, word ${newActiveWordIndex}`);
                            }
                        }
                        
                        currentWordIndex = newActiveWordIndex;
                    }
                } else {
                    console.warn('Current line is missing the expected structure:', currentLine);
                }
            }


            // --- Stop Interval ---
            let endOfLyrics = false;
            if (subtitles.length > 0) { // Check if subtitles exist before accessing them
                if (lyricsType === 'richsync') {
                     // Stop if time exceeds the end time of the last line
                     endOfLyrics = diff > (subtitles[subtitles.length - 1]?.te || 0);
                } else if (lyricsType === 'subtitle') {
                     // Stop 2 seconds after the start time of the last line
                     const lastLineIndex = subtitles.length - 1;
                     endOfLyrics = currentLyricIndex === lastLineIndex && diff > (subtitles[lastLineIndex]?.time.total || 0) + 2000;
                }
            }

            if (endOfLyrics && playbackIntervalId) {
                 clearInterval(playbackIntervalId);
                 playbackIntervalId = null;
                 // Optionally reset highlighting after a short delay
                 // setTimeout(resetPlayback, 1000);
            }

        }, 50); // Check more frequently for smoother word highlighting
    }

    /** Function to sync playback to a specific time */
    function syncPlayback(startTimeMs: number) {
        console.log(`syncPlayback called with startTimeMs: ${startTimeMs}`);
        if (!subtitles || subtitles.length === 0) return;

        // Calculate the new 'then' value to make the current time match the desired startTimeMs
        const now = new Date().getTime();
        console.log(`Current time (now): ${now}`); // Log current time
        then = now - startTimeMs;
        console.log(`Calculated playback start time (then): ${then}`); // Log calculated 'then'

        // Always clear any existing interval and restart playback from the new time
        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }
        
        // Call playLyrics to start/restart the interval with the adjusted 'then' value
        // playLyrics internally calls resetPlayback first, ensuring a clean state.
        playLyrics(); 
    }

    const checkForScroll = () => {
        let scrollingTimeout: ReturnType<typeof setTimeout>;
        window.addEventListener("scroll", () => {
            clearTimeout(scrollingTimeout);
            isScrolling = true;
            scrollingTimeout = setTimeout(() => {
                isScrolling = false;
            }, 500);
        })
    }

    const parseToken = () => {
        getToken().then(data => {
            try {
                token = data.message.body.user_token;
                (document.getElementById("submit") as HTMLInputElement)!.disabled = false;
                document.getElementById("error-musixmatch")!.style.display = "none";
                localStorage.setItem("token", token);
            } catch (_) {
                // user token not in message
                if (localStorage.getItem("token") == null) {
                    console.error("Musixmatch token can not be accessed (blocked by a captcha?) and no localStorage alternative");
                    document.getElementById("error-musixmatch")!.style.display = "block";
                    setTimeout(parseToken, 1000); 
                }
                else {
                    token = localStorage.getItem("token") || "";
                    console.warn("Musixmatch token is blocked, but a localStorage alternative is avaliable.")
                    document.getElementById("error-musixmatch")!.style.display = "none";
                    (document.getElementById("submit") as HTMLInputElement)!.disabled = false;
                    setTimeout(parseToken, 5000); 
                }
            }
        }).catch(_ => {
            if (localStorage.getItem("token") == null) {
                console.error("Musixmatch token can not be accessed (blocked by a captcha?) and no localStorage alternative");
                document.getElementById("error-musixmatch")!.style.display = "block";
                setTimeout(parseToken, 1000); 
            }
            else {
                token = localStorage.getItem("token") || "";
                console.warn("Musixmatch token is blocked, but a localStorage alternative is avaliable.")
                document.getElementById("error-musixmatch")!.style.display = "none";
                (document.getElementById("submit") as HTMLInputElement)!.disabled = false;
                setTimeout(parseToken, 5000); 
            }
        });
    }

    onMount(() => {
        checkForScroll();
        (document.getElementById("submit") as HTMLInputElement)!.disabled = true; // disable the search button
        parseToken(); // parse for musixmatch token
        document.getElementById("artistForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            currentPage = 1;
            // searchSong now uses fetchWithRetry
            searchSong((<HTMLInputElement>document.getElementById("song"))?.value).then((data) => {
                 if (!data || data.message.header.status_code !== 200) {
                    // Provide an empty track object matching the type structure for errors
                    info = [{ track: { track_id: 0, track_name: "ERROR", artist_name: "", album_coverart_100x100: "" } }];
                 } else {
                     info = data.message.body.track_list;
                 }
            }).catch(error => {
                 console.error("Error in form submission search:", error);
                 info = [{ track: { track_id: 0, track_name: "ERROR searching", artist_name: "", album_coverart_100x100: "" } }];
            });
        });
    });
</script>

<svelte:head>
    <title>Live Lyrics</title>
    <meta name="description" content="Live lyrics for free, powered by Musixmatch! Sync to your songs and more...">
</svelte:head>

<form id="artistForm" method="post">
    <div style="padding: .5em 0;">
        <label for="song"><svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path opacity="1" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></label>
        <input type="text" bind:value={songValue} autocorrect="off" autocapitalize="off" name="song" required id="song" placeholder="Song, lyrics, artist..." spellcheck="false">
    </div>
    <input id="submit" type="submit" value="Search">
</form>

<br />

<!-- TODO do this -->
<span id="instrumental"></span>
<span id="explicit"></span>

<i>Not what you're looking for? Add the artist into your search</i><br>
<p id="error-musixmatch" style="color: #f00; display: none;">Sorry, Musixmatch is currently blocking your requests. Please wait up to 5 minutes - the issue will resolve itself.</p>
<ul id="searchResults">
    <!-- TODO: make this a carousel of vertical cards LOL -->
    {#each info as thing, i}
        <li>
            <button class="searchButtons" on:click={() => parseLyrics(thing.track.track_id)}>
                <!-- this replace job is not my finest work. -->
                <img src={thing.track.album_coverart_100x100.replace("http", "https").replace("httpss", "https")} alt="Cover image of {thing.track.track_name}" width="50" height="50">
                <div>
                    <b>{thing.track.track_name}</b>
                    <br />
                    <span>{thing.track.artist_name}</span>
                </div>
            </button>
            
        </li>
    {/each}
    <li class="pagination">
        <!-- wonderful code here, not a pain to see -->
        <button class="searchButtons" on:click={() => { if (currentPage > 1 && info.length > 0) { searchSong(songValue, currentPage - 1).then((data) => { info = (data.message.header.status_code !== 200) ? [{ track: { track_id: 0, track_name: "ERROR", artist_name: "", album_coverart_100x100: "" } }] : data.message.body.track_list; }); currentPage -= 1; } }}><svg height="16" width="12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5 0-45.3l-160 160z"/></svg></button>
        <span>{currentPage}</span>
        <button class="searchButtons" on:click={() => { if (info.length > 0) { searchSong(songValue, currentPage + 1).then((data) => { info = (data.message.header.status_code !== 200) ? [{ track: { track_id: 0, track_name: "ERROR", artist_name: "", album_coverart_100x100: "" } }] : data.message.body.track_list; }); currentPage += 1; }}}><svg height="16" width="12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 0-45.3l160 160z"/></svg></button>
    </li>
</ul>

<div style="display: flex; align-items: center; justify-content: space-between;">
    <button id="playButton" on:click={() => { 
        // Reset playback state and set start time to now before playing
        resetPlayback(); 
        then = new Date().getTime(); 
        playLyrics(); 
    }}><svg xmlns="http://www.w3.org/2000/svg" height="16" width="12" viewBox="0 0 384 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path opacity="1" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>    Play lyrics</button>
    <Switch fontSize={24} bind:value={autoScroll} design="slider" label="Auto-scroll" />
</div>

<div id="lyrics">
    <p style="font-size: 1rem">To sync to a line, click on it (after playing lyrics). Press 'Play lyrics' to begin the logic</p>
    {#if subtitles.length > 0}
        {#if lyricsType === 'richsync'}
            {#each subtitles as line, i}
                <div class="lyric-line" data-index={i} data-ts={line.ts} data-te={line.te} on:click={() => syncPlayback(line.ts)}>
                    {#each line.l as word, j}
                        {#if word.c.trim() !== ''} 
                            <!-- Only create a span for non-space words -->
                            <span class="lyric-word" data-line-index={i} data-word-index={j} data-offset={word.o * 1000}>
                                {word.c.trim()}
                            </span>
                        {:else}
                            <!-- Render spaces directly without a span -->
                            {' '}
                        {/if}
                    {/each}
                </div>
            {/each}
        {:else if lyricsType === 'subtitle'}
            {#each subtitles as line, i}
                <!-- Changed from button to div, added on:click -->
                <div class="lyric-line" data-index={i} data-timestamp={line.time.total} on:click={() => syncPlayback(line.time.total)}>
                    {line.text}
                </div>
            {/each}
        {:else}
            <!-- Handle error or unknown type -->
            <p>{subtitles[0]?.text || "Loading lyrics..."}</p>
        {/if}
    {:else}
        <p>Select a song to see lyrics.</p>
    {/if}
</div>

<style lang="scss">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
    * {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif!important;
    }
    button {
        cursor: pointer;
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
        width: calc(100% - 1rem);  /* Account for margin */
        margin: 0 .5rem;
        overflow: hidden;
        box-sizing: border-box;
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

    :global(.lyric-word.active-word) {
        /* Style for the currently active word - removing background highlight */
        background-color: transparent !important; /* Remove background color */
        padding: 0 !important; /* Remove padding */
        border-radius: 0 !important; /* Remove border radius */
        font-weight: bold !important;
        color: inherit !important;
        opacity: 1 !important; /* Full opacity for active word */
        transition: opacity 0.2s ease-in !important;
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
            cursor: pointer;
            transition: .1s;
            &:hover {
                filter: brightness(0.9);
            }
            &:disabled {
                filter: brightness(1)!important;
                background-color: #afafaf;
                cursor: not-allowed;
            }
        }
        svg {
            height: 1.25em;
            margin-left: 1rem;
            width: 1.25em;
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
            margin-left: 5px;
        }
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
    }
    #searchResults {
        width: 100%;
        margin: 0 .5rem;
        overflow: hidden;
    }
    #playButton {
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
        margin: 0;
        padding: 0 16px; /* Add horizontal padding to the edges */
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
        box-sizing: border-box;
        button {
            margin: 0;
        }
        
        /* Larger text size for lyrics */
        font-size: 1.8em;
        line-height: 1.5;
    }
    @media (prefers-color-scheme: dark) {
        :global(body) {
            background-color: #222;
            color: white;
        }

        #playButton, .searchButtons, #lyrics button {
            color: white;
        }
        svg {
            // color: white !important;
            filter: invert(100%);
        }
        #song {
            background: #222!important;
            color: white;
        }
    }
    i {
        margin-left: .5rem;
        display: block;
    }
    #lyrics div.lyric-line {
        /* Style for individual lyric lines */
        display: block; /* Ensure each button takes full width */
        margin: 2px 0; /* Reduced margin for tighter spacing */
        padding: 2px; /* Reduced padding */
        text-align: left;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
        width: 100%;
        border-radius: 4px;
        transition: background-color 0.2s ease-in-out; /* Smooth transition for active state */
    }

    #lyrics div.lyric-line.active {
        /* Subtle highlight for active line */
        padding: 4px !important;
        border-radius: 4px !important;
        position: relative !important;
    }

    /* Apple Music-style word opacity animation */
    #lyrics div.lyric-line .lyric-word {
        opacity: 0.5; /* Default opacity for all words */
        transition: opacity 0.2s ease-out;
    }

    /* Words in non-active lines have lower opacity */
    #lyrics div.lyric-line:not(.active) .lyric-word {
        opacity: 0.4;
    }
    
    /* Active word styling - Apple Music style with full opacity */
    :global(.lyric-word.active-word) {
        opacity: 1 !important; /* Full opacity for active word */
        font-weight: bold !important;
        color: inherit !important;
        transition: opacity 0.1s ease-in !important;
    }

    /* Remove old scrolling animation */
    /* @keyframes lineGradientScroll { ... } */

    /* Add responsive container styling */
    :global(body) {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        width: 100%;
        max-width: 100vw;
        overflow-x: hidden;
    }
</style>
