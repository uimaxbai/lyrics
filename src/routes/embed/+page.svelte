<!-- src/routes/embed/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';

    // --- State Variables ---
    let subtitles: any[] = [];
    let lyricsType: 'subtitle' | 'richsync' | null = null;
    let isLoading = true;
    let errorMsg: string | null = null;
    let trackName: string | null = null;
    let artistName: string | null = null;
    let then = 0;
    let currentLyricIndex = -1;
    let playbackIntervalId: ReturnType<typeof setInterval> | null = null;

    // --- Type Definitions (Copied from main page for now) ---
    type RichSyncWord = { c: string; o: number; };
    type RichSyncLine = { ts: number; te: number; l: RichSyncWord[]; x?: string };
    type SubtitleLine = { time: { total: number }; text: string };

    // --- API Interaction Logic (Copied & adapted from main page) ---
    // Ideally, move this to a shared lib file later
    var apiPrefixes = ["/api/v1", "https://vercel.lyrics.binimum.org", "https://cloudflare.lyrics.binimum.org", "https://netlify.lyrics.binimum.org"];

    async function fetchWithRetry(basePathWithQuery: string) {
        const hardcodedToken = "201219dbdb0f6aaba1c774bd931d0e79a28024e28db027ae72955c"; // Fallback token

        // Simplified retry logic for embed: try prefixes with hardcoded token directly
        console.log("Embed: Attempting fetch with hardcoded token across prefixes.");
        for (const fallbackPrefix of apiPrefixes) {
            try {
                const fallbackUrlObject = new URL(fallbackPrefix + basePathWithQuery, window.location.origin);
                fallbackUrlObject.searchParams.set('token', hardcodedToken);
                const fallbackFullUrl = fallbackUrlObject.toString();

                console.log(`Embed: Fetching data using fallback token from: ${fallbackFullUrl}`);
                const response = await fetch(fallbackFullUrl);
                if (!response.ok) {
                    throw new Error(`Embed: Fallback data fetch failed for ${fallbackFullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                if (data?.message?.header?.status_code === 200) {
                    console.log(`Embed: Success with fallback token using prefix: ${fallbackPrefix}`);
                    return data;
                } else {
                    throw new Error(`Embed: API returned error in body for fallback request ${fallbackFullUrl}: Status code ${data?.message?.header?.status_code}`);
                }
            } catch (error) {
                console.error(`Embed: Error during fallback attempt with prefix ${fallbackPrefix}:`, error);
            }
        }
        console.error("Embed: All API prefixes failed with hardcoded token.");
        throw new Error("Embed: Failed to fetch data from API using fallback token.");
    }

    async function searchSong(name: string) {
        const basePathWithQuery = `/searchSong?q=${encodeURIComponent(name)}&page=1`; // Only first page
        return await fetchWithRetry(basePathWithQuery);
    }

    async function getLyrics(id: number) {
        const basePathWithQuery = `/getLyrics?id=${id}`;
        return await fetchWithRetry(basePathWithQuery);
    }

    function resetPlayback() {
        then = 0;
        currentLyricIndex = -1;
        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }
        document.querySelectorAll(".active").forEach(el => {
            (el as HTMLElement).classList.remove("active");
            (el as HTMLElement).style.removeProperty('--line-progress');
        });
    }

    function playLyrics() {
        if (!subtitles || subtitles.length === 0 || !lyricsType) return;

        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }

        document.querySelectorAll(".active").forEach(el => {
            (el as HTMLElement).classList.remove("active");
            (el as HTMLElement).style.removeProperty('--line-progress');
        });
        currentLyricIndex = -1;

        playbackIntervalId = setInterval(() => {
            const now = (new Date()).getTime();
            const diff = now - then;
            let newActiveLineIndex = -1;

            // Find Active Line
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

            // Handle Line Change
            if (newActiveLineIndex !== currentLyricIndex) {
                if (currentLyricIndex !== -1) {
                    const oldLineEl = document.querySelector(`.lyrics-display [data-index="${currentLyricIndex}"]`) as HTMLElement | null;
                    oldLineEl?.classList.remove("active");
                    oldLineEl?.style.removeProperty('--line-progress');
                }
                if (newActiveLineIndex !== -1) {
                    const newLineEl = document.querySelector(`.lyrics-display [data-index="${newActiveLineIndex}"]`) as HTMLElement | null;
                    newLineEl?.classList.add("active");
                }
                currentLyricIndex = newActiveLineIndex;
            }

            // Handle Line Gradient Progress (Richsync Only)
            if (lyricsType === 'richsync' && currentLyricIndex !== -1) {
                const currentLine = subtitles[currentLyricIndex];
                const activeLineEl = document.querySelector(`.lyrics-display [data-index="${currentLyricIndex}"]`) as HTMLElement | null;
                if (currentLine && activeLineEl && typeof currentLine.ts === 'number' && typeof currentLine.te === 'number') {
                    const timeWithinLine = diff - currentLine.ts;
                    const lineDuration = currentLine.te - currentLine.ts;
                    const progressPercent = lineDuration > 0
                        ? Math.min(100, Math.max(0, (timeWithinLine / lineDuration) * 100))
                        : (timeWithinLine >= 0 ? 100 : 0);
                    activeLineEl.style.setProperty('--line-progress', `${progressPercent}%`);
                } else {
                    activeLineEl?.style.removeProperty('--line-progress');
                }
            } else if (currentLyricIndex !== -1) {
                const activeLineEl = document.querySelector(`.lyrics-display [data-index="${currentLyricIndex}"]`) as HTMLElement | null;
                activeLineEl?.style.removeProperty('--line-progress');
            }

            // Stop Interval
            let endOfLyrics = false;
            if (subtitles.length > 0) {
                if (lyricsType === 'richsync') {
                    endOfLyrics = diff > (subtitles[subtitles.length - 1]?.te || 0);
                } else if (lyricsType === 'subtitle') {
                    const lastLineIndex = subtitles.length - 1;
                    endOfLyrics = currentLyricIndex === lastLineIndex && diff > (subtitles[lastLineIndex]?.time.total || 0) + 2000;
                }
            }
            if (endOfLyrics && playbackIntervalId) {
                clearInterval(playbackIntervalId);
                playbackIntervalId = null;
            }
        }, 50);
    }

    function syncPlayback(startTimeMs: number) {
        if (!subtitles || subtitles.length === 0) return;
        const now = new Date().getTime();
        then = now - startTimeMs;
        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }
        playLyrics();
    }

    function parseLyrics(id: number, initialTrackName?: string, initialArtistName?: string) {
        isLoading = true;
        errorMsg = null;
        trackName = initialTrackName || "Loading...";
        artistName = initialArtistName || "";

        getLyrics(id).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                throw new Error("ERROR fetching lyrics");
            }

            lyricsType = data.type;
            console.log(`Embed: Lyrics type received: ${lyricsType}`);

            if (lyricsType === 'richsync') {
                try {
                    subtitles = JSON.parse(data.message.body.richsync.richsync_body);
                    let validStructure = Array.isArray(subtitles) && subtitles.length > 0 &&
                                        typeof subtitles[0].ts === 'number' &&
                                        typeof subtitles[0].te === 'number' &&
                                        Array.isArray(subtitles[0].l);

                    if (!validStructure) {
                         subtitles = subtitles.map((line: any): RichSyncLine => ({
                            ...line,
                            ts: typeof line.ts === 'number' ? line.ts * 1000 : 0,
                            te: typeof line.te === 'number' ? line.te * 1000 : 5000,
                            l: Array.isArray(line.l) ? line.l.map((word: any): RichSyncWord => ({ ...word, o: typeof word.o === 'number' ? word.o : 0 })) : [{ c: line.x || "Unknown", o: 0 }]
                        }));
                    } else {
                        subtitles = subtitles.map((line: RichSyncLine): RichSyncLine => ({
                            ...line,
                            ts: line.ts * 1000,
                            te: line.te * 1000
                        }));
                    }
                } catch (e) {
                    throw new Error("Error parsing richsync data");
                }
            } else if (lyricsType === 'subtitle') {
                subtitles = JSON.parse(data.message.body.subtitle.subtitle_body);
                 subtitles = subtitles.map((line: SubtitleLine): SubtitleLine => ({
                    ...line,
                    time: { total: line.time.total * 1000 }
                }));
            } else {
                 throw new Error("Unknown lyrics format");
            }
            isLoading = false;
            resetPlayback();
        }).catch(error => {
            console.error("Embed: Error in parseLyrics:", error);
            errorMsg = error.message || "Failed to load lyrics.";
            subtitles = [];
            lyricsType = null;
            isLoading = false;
        });
    }

    // --- Component Logic ---
    onMount(() => {
        const query = $page.url.searchParams.get('q');
        const trackIdStr = $page.url.searchParams.get('id');

        if (trackIdStr) {
            const trackId = parseInt(trackIdStr, 10);
            if (!isNaN(trackId)) {
                // Fetch lyrics directly if ID is provided
                 // We don't have track/artist name here initially
                parseLyrics(trackId);
            } else {
                errorMsg = "Invalid Track ID provided.";
                isLoading = false;
            }
        } else if (query) {
            // Search if query is provided
            isLoading = true;
            errorMsg = null;
            trackName = `Searching for "${query}"...`;
            artistName = "";
            searchSong(query).then(data => {
                if (!data || data.message.header.status_code !== 200 || !data.message.body.track_list || data.message.body.track_list.length === 0) {
                     throw new Error(`No results found for "${query}"`);
                }
                const firstResult = data.message.body.track_list[0].track;
                trackName = firstResult.track_name; // Update track name
                artistName = firstResult.artist_name; // Update artist name
                parseLyrics(firstResult.track_id, firstResult.track_name, firstResult.artist_name); // Pass names
            }).catch(error => {
                 console.error("Embed: Error searching song:", error);
                 errorMsg = error.message || "Failed to search for song.";
                 isLoading = false;
                 trackName = null;
                 artistName = null;
            });
        } else {
            errorMsg = "No song query (q=...) or track ID (id=...) provided in the URL.";
            isLoading = false;
        }
    });

</script>

<svelte:head>
    <title>Lyrics Embed{trackName ? `: ${trackName}` : ''}</title>
    <meta name="description" content="Embedded lyrics display">
    <!-- Prevent search engine indexing for embed page -->
    <meta name="robots" content="noindex, nofollow">
</svelte:head>

<div class="embed-container">
    {#if trackName || artistName}
        <header>
            {#if trackName}<h1>{trackName}</h1>{/if}
            {#if artistName}<p>{artistName}</p>{/if}
        </header>
    {/if}

    {#if isLoading}
        <p>Loading lyrics...</p>
    {:else if errorMsg}
        <p class="error">Error: {errorMsg}</p>
    {:else if subtitles.length > 0}
        <!-- Add Play Button -->
        <button class="play-button" on:click={() => { 
            resetPlayback(); 
            then = new Date().getTime(); 
            playLyrics(); 
        }}>Play</button>

        <!-- Updated Lyrics Display Structure -->
        <div class="lyrics-display">
            {#if lyricsType === 'richsync'}
                {#each subtitles as line, i}
                    <div 
                        class="lyric-line richsync" 
                        data-index={i} 
                        data-ts={line.ts} 
                        data-te={line.te} 
                        on:click={() => syncPlayback(line.ts)} 
                        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') syncPlayback(line.ts); }}
                        role="button" 
                        tabindex="0"
                    >
                        {#each line.l as word, j}
                            {#if word.c.trim() !== ''} 
                                <span class="lyric-word" data-line-index={i} data-word-index={j} data-offset={word.o * 1000}>
                                    {word.c.trim()}
                                </span>
                            {:else}
                                {' '}
                            {/if}
                        {/each}
                    </div>
                {/each}
            {:else if lyricsType === 'subtitle'}
                {#each subtitles as line, i}
                    <div 
                        class="lyric-line subtitle" 
                        data-index={i} 
                        data-timestamp={line.time.total} 
                        on:click={() => syncPlayback(line.time.total)}
                        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') syncPlayback(line.time.total); }}
                        role="button" 
                        tabindex="0"
                    >
                        {line.text}
                    </div>
                {/each}
            {:else}
                 <p class="error">Could not display lyrics (unknown format).</p>
            {/if}
        </div>
    {:else}
         <p>No lyrics available for this song.</p>
    {/if}
</div>

<style>
    /* Basic styling for embed */
    .embed-container {
        font-family: sans-serif;
        padding: 1em;
        background-color: var(--embed-bg, #fff);
        color: var(--embed-text, #333);
        line-height: 1.6;
        max-width: 600px; /* Optional: constrain width */
        margin: 0 auto; /* Optional: center */
    }

    header {
        margin-bottom: 1em;
        padding-bottom: 0.5em;
        border-bottom: 1px solid var(--embed-border, #eee);
    }

    header h1 {
        font-size: 1.4em;
        margin: 0 0 0.2em 0;
    }
     header p {
        font-size: 1em;
        margin: 0;
        color: var(--embed-subtext, #666);
    }

    .lyrics-display {
        font-size: 1.2em; /* Slightly larger for readability */
        line-height: 1.6;
    }

    .lyric-line {
        margin-bottom: 0.8em;
        padding: 4px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s ease-in-out;
    }

    .lyric-line:focus {
        outline: 2px solid var(--embed-focus-ring, dodgerblue);
        outline-offset: 2px;
    }

    /* Use :global() for dynamically added class */
    :global(.lyric-line.active) {
        position: relative; /* Needed for gradient positioning */
    }

    /* Base style for words - slightly dimmed */
    .lyric-word {
        opacity: 0.6;
        display: inline-block; /* Needed for background-clip */
        transition: none; /* Gradient handles the transition */
    }

    /* Style for words in the ACTIVE line using gradient */
    /* Use :global() for dynamically added class */
    :global(.lyric-line.active .lyric-word) {
        opacity: 1;
        /* Default gradient for light mode */
        background: linear-gradient(to right, 
            var(--embed-text, #333) var(--line-progress, 0%), 
            var(--embed-dim-text, rgba(51, 51, 51, 0.4)) var(--line-progress, 0%)
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }

    .error {
        color: var(--embed-error-text, #d9534f);
        font-weight: bold;
    }

    .play-button {
        padding: 0.5em 1em;
        margin-bottom: 1em;
        cursor: pointer;
        background-color: var(--embed-button-bg, #f0f0f0);
        color: var(--embed-button-text, #333);
        border: 1px solid var(--embed-border, #ccc);
        border-radius: 4px;
        font-size: 1em;
    }

    .play-button:hover {
        background-color: var(--embed-button-hover-bg, #e0e0e0);
    }

    /* Optional: Dark mode support via CSS variables */
    @media (prefers-color-scheme: dark) {
        .embed-container {
            --embed-bg: #222;
            --embed-text: #eee;
            --embed-border: #444;
            --embed-subtext: #aaa;
            --embed-error-text: #f08080; /* Lighter red for dark mode */
            --embed-button-bg: #444;
            --embed-button-text: #eee;
            --embed-button-hover-bg: #555;
            --embed-active-line-bg: rgba(255, 255, 255, 0.1);
            --embed-dim-text: rgba(238, 238, 238, 0.5);
            --embed-focus-ring: lightblue;
        }

        /* Gradient for dark mode */
        /* Use :global() for dynamically added class */
        :global(.lyric-line.active .lyric-word) {
             background: linear-gradient(to right, 
                var(--embed-text, #eee) var(--line-progress, 0%), 
                var(--embed-dim-text, rgba(238, 238, 238, 0.5)) var(--line-progress, 0%)
            );
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
    }
</style>
