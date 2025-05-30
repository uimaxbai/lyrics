<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import Switch from './Switch.svelte';

    // Change apiPrefix to an array of potential prefixes
    var apiPrefixes = ["/api/v1", "https://vercel.lyrics.binimum.org", "https://cloudflare.lyrics.binimum.org", "https://netlify.lyrics.binimum.org"]; // Example prefixes
    var token = ""; // This might become less relevant if fetchWithRetry always gets a token or uses fallback
    let autoScroll: boolean;
    let isScrolling = false;
    let songValue = "";
    let currentPage = 1;

    // URL parameter detection
    let hideSearchBar = false;
    let transparentBackground = false;
    let directLyrics = false; // Flag to indicate if we're loading lyrics directly from URL params
    let trackName: string | null = null;
    let artistName: string | null = null;

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
    let searchPerformed = false; // Flag to track if a search has been done
    let searchError = false; // Flag to track if the search resulted in an error
    let then = 0;
    let currentLyricIndex = -1; // Track the currently active lyric index
    let currentWordIndex = -1; // Track the currently active word index within a line
    let playbackIntervalId: ReturnType<typeof setInterval> | null = null; // Declare interval ID variable

    type RichSyncWord = { c: string; o: number; };
    type RichSyncLine = { ts: number; te: number; l: RichSyncWord[]; x?: string }; // Added x for fallback case
    type SubtitleLine = { time: { total: number }; text: string };

    // Helper function to fetch with retry logic for different prefixes and fallback token
    async function fetchWithRetry(basePathWithQuery: string) { // e.g., /searchSong?q=...
        const hardcodedToken = "201219dbdb0f6aaba1c774bd931d0e79a28024e28db027ae72955c"; // The fallback token

        // --- Attempt with one randomly chosen endpoint first ---
        if (apiPrefixes.length > 0) {
            const randomIndex = Math.floor(Math.random() * apiPrefixes.length);
            const randomPrefix = apiPrefixes[randomIndex];
            console.log(`Attempting initial fetch with randomly chosen prefix: ${randomPrefix}`);
            try {
                // 1. Fetch token for the random prefix
                console.log(`Fetching token using random prefix: ${randomPrefix}`);
                const tokenResponse = await fetch(`${randomPrefix}/getToken`);
                if (!tokenResponse.ok) {
                    throw new Error(`Token fetch failed for random ${randomPrefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
                }
                const tokenData = await tokenResponse.json();
                if (tokenData?.message?.header?.status_code !== 200 || !tokenData?.message?.body?.user_token) {
                    throw new Error(`Invalid token data or error status code from random ${randomPrefix}: ${tokenData?.message?.header?.status_code}`);
                }
                const currentToken = tokenData.message.body.user_token;
                console.log(`Successfully obtained token for random prefix ${randomPrefix}`);

                // 2. Construct URL for the actual request using the new token
                const urlObject = new URL(randomPrefix + basePathWithQuery, window.location.origin);
                urlObject.searchParams.set('token', currentToken);
                const fullUrl = urlObject.toString();

                // 3. Fetch the actual data using the obtained token
                console.log(`Fetching data from (random attempt): ${fullUrl}`);
                const response = await fetch(fullUrl);
                if (!response.ok) {
                    throw new Error(`Data fetch failed for random ${fullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                // 4. Check the body status code for the data response
                if (data?.message?.header?.status_code === 200) {
                    console.log(`Success with randomly chosen prefix: ${randomPrefix} (using fetched token)`);
                    return data; // Success! Return data.
                }
                // If status code is not 200, treat it as a failure for this random attempt
                throw new Error(`API returned error in body for random ${fullUrl}: Status code ${data?.message?.header?.status_code}`);

            } catch (error) {
                console.error(`Initial random attempt with prefix ${randomPrefix} failed:`, error);
                // Fall through to sequential attempts if the random one fails
            }
        }

        // --- Sequential attempts with fetched tokens (if random failed) ---
        console.log("Random attempt failed or no prefixes. Starting sequential fallback with fetched tokens.");
        for (const prefix of apiPrefixes) {
            try {
                // ... (rest of the token fetching and data fetching logic as before)
                console.log(`Attempting to fetch token using prefix: ${prefix}`);
                const tokenResponse = await fetch(`${prefix}/getToken`);
                if (!tokenResponse.ok) {
                    throw new Error(`Token fetch failed for ${prefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
                }
                const tokenData = await tokenResponse.json();
                if (tokenData?.message?.header?.status_code !== 200 || !tokenData?.message?.body?.user_token) {
                    throw new Error(`Invalid token data or error status code from ${prefix}: ${tokenData?.message?.header?.status_code}`);
                }
                const currentToken = tokenData.message.body.user_token;
                console.log(`Successfully obtained token for prefix ${prefix}`);

                const urlObject = new URL(prefix + basePathWithQuery, window.location.origin);
                urlObject.searchParams.set('token', currentToken);
                const fullUrl = urlObject.toString();

                console.log(`Fetching data from: ${fullUrl}`);
                const response = await fetch(fullUrl);
                if (!response.ok) {
                    throw new Error(`Data fetch failed for ${fullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                if (data?.message?.header?.status_code === 200) {
                    console.log(`Success with prefix: ${prefix} (using fetched token)`);
                    return data;
                } else {
                    throw new Error(`API returned error in body for ${fullUrl}: Status code ${data?.message?.header?.status_code}`);
                }
            } catch (error) {
                console.error(`Error with prefix ${prefix} (using fetched token):`, error);
                // Continue to the next prefix
            }
        }

        // --- Fallback attempts with hardcoded token across all prefixes (if sequential fetched tokens failed) ---
        console.log("Sequential attempts with fetched tokens failed. Attempting fallback with hardcoded token across all prefixes.");
        for (const fallbackPrefix of apiPrefixes) {
            try {
                // ... (rest of the hardcoded token logic as before)
                const fallbackUrlObject = new URL(fallbackPrefix + basePathWithQuery, window.location.origin);
                fallbackUrlObject.searchParams.set('token', hardcodedToken);
                const fallbackFullUrl = fallbackUrlObject.toString();

                console.log(`Fetching data using fallback token from: ${fallbackFullUrl}`);
                const response = await fetch(fallbackFullUrl);
                if (!response.ok) {
                    throw new Error(`Fallback data fetch failed for ${fallbackFullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                if (data?.message?.header?.status_code === 200) {
                    console.log(`Success with fallback token using prefix: ${fallbackPrefix}`);
                    return data;
                } else {
                    throw new Error(`API returned error in body for fallback request ${fallbackFullUrl}: Status code ${data?.message?.header?.status_code}`);
                }
            } catch (error) {
                console.error(`Error during fallback attempt with prefix ${fallbackPrefix} (using hardcoded token):`, error);
                // Continue to the next fallback prefix
            }
        }

        // If all attempts failed
        console.error("All API prefixes failed with random, fetched, and hardcoded tokens.");
        throw new Error("Failed to fetch data from API after trying random, sequential fetched, and fallback tokens.");
    }

    async function searchSong(name: string, page: number = 1) {
        // Construct URL without token
        const basePathWithQuery = `/searchSong?q=${encodeURIComponent(name)}&page=${page}`;
        // Use the fetchWithRetry helper
        return await fetchWithRetry(basePathWithQuery);
    }

    async function getLyrics(id: number) {
        // Construct URL without token
        const basePathWithQuery = `/getLyrics?id=${id}`;
        // Use the fetchWithRetry helper
        return await fetchWithRetry(basePathWithQuery);
    }

    async function getLyricsByISRC(isrc: string) {
        // First search for the track using ISRC to get the track ID
        const basePathWithQuery = `/searchSong?isrc=${encodeURIComponent(isrc)}`;
        const searchData = await fetchWithRetry(basePathWithQuery);
        
        if (!searchData || searchData.message.header.status_code !== 200) {
            throw new Error("Failed to search for track by ISRC");
        }
        
        // Extract track ID from search results
        if (!searchData.message.body.track_list || searchData.message.body.track_list.length === 0) {
            throw new Error("No tracks found for the given ISRC");
        }
        
        const trackId = searchData.message.body.track_list[0].track.track_id;
        
        // Now get lyrics using the track ID
        const lyricsData = await getLyrics(trackId);
        
        // Add track info to the lyrics response for display
        if (lyricsData && searchData.message.body.track_list[0].track) {
            lyricsData.message.body.track_info = {
                track_name: searchData.message.body.track_list[0].track.track_name,
                artist_name: searchData.message.body.track_list[0].track.artist_name
            };
        }
        
        return lyricsData;
    }

    async function getLyricsByQuery(query: string) {
        // First search for the track using query to get the track ID
        const basePathWithQuery = `/searchSong?q=${encodeURIComponent(query)}`;
        const searchData = await fetchWithRetry(basePathWithQuery);
        
        if (!searchData || searchData.message.header.status_code !== 200) {
            throw new Error("Failed to search for track by query");
        }
        
        // Extract track ID from search results
        if (!searchData.message.body.track_list || searchData.message.body.track_list.length === 0) {
            throw new Error("No tracks found for the given query");
        }
        
        const trackId = searchData.message.body.track_list[0].track.track_id;
        
        // Now get lyrics using the track ID
        const lyricsData = await getLyrics(trackId);
        
        // Add track info to the lyrics response for display
        if (lyricsData && searchData.message.body.track_list[0].track) {
            lyricsData.message.body.track_info = {
                track_name: searchData.message.body.track_list[0].track.track_name,
                artist_name: searchData.message.body.track_list[0].track.artist_name
            };
        }
        
        return lyricsData;
    }

    // Removed the standalone getToken function as fetchWithRetry handles token fetching internally for data requests.

    // Helper function to try getting an initial token from any prefix
    async function tryGetInitialToken() {
        for (const prefix of apiPrefixes) {
            try {
                console.log(`Attempting initial token fetch from: ${prefix}/getToken`);
                const tokenResponse = await fetch(`${prefix}/getToken`);
                if (!tokenResponse.ok) {
                    throw new Error(`Initial token fetch failed for ${prefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
                }
                const tokenData = await tokenResponse.json();
                if (tokenData?.message?.header?.status_code === 200 && tokenData?.message?.body?.user_token) {
                    console.log(`Successfully obtained initial token from ${prefix}`);
                    return tokenData.message.body.user_token; // Return the first valid token found
                } else {
                    // Don't throw error here, just log and try next prefix
                    console.warn(`Invalid initial token data or error status code from ${prefix}: ${tokenData?.message?.header?.status_code}`);
                }
            } catch (error) {
                console.error(`Error fetching initial token from ${prefix}:`, error);
                // Continue to next prefix
            }
        }
        // If loop finishes, no token obtained
        console.warn("Could not obtain initial token from any prefix.");
        return null;
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
                        subtitles = subtitles.map((line: any): RichSyncLine => ({
                            ...line,
                            ts: typeof line.ts === 'number' ? line.ts * 1000 : 0,
                            te: typeof line.te === 'number' ? line.te * 1000 : 5000,
                            // Create a fake 'l' array if it doesn't exist
                            l: Array.isArray(line.l) ? line.l.map((word: any): RichSyncWord => ({
                                ...word,
                                o: typeof word.o === 'number' ? word.o : 0
                            })) : [{ c: line.x || "Unknown", o: 0 }]
                        }));
                    } else {
                        // Convert ts and te from seconds to milliseconds for consistency
                        subtitles = subtitles.map((line: RichSyncLine): RichSyncLine => ({
                            ...line,
                            ts: line.ts * 1000,
                            te: line.te * 1000
                        }));
                    }
                    
                    // Log the first line's structure for richsync
                    if (subtitles.length > 0) {
                        console.log("First richsync line structure after processing:", subtitles[0]);
                        console.log(`First line has ${subtitles[0].l?.length || 0} words`);
                        subtitles[0].l?.forEach((word: RichSyncWord, i: number) => {
                            console.log(`  Word ${i}: \"${word.c}\" at offset ${word.o}s`);
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
                 subtitles = subtitles.map((line: SubtitleLine): SubtitleLine => ({
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

    function parseLyricsByISRC(isrc: string) {
        // Similar to parseLyrics but uses ISRC
        getLyricsByISRC(isrc).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics by ISRC" }];
                lyricsType = null;
                return;
            }

            // Extract track info from the response for direct lyrics
            if (data.message.body.track_info) {
                trackName = data.message.body.track_info.track_name || null;
                artistName = data.message.body.track_info.artist_name || null;
            }

            lyricsType = data.type;
            console.log(`Lyrics type received (ISRC): ${lyricsType}`);

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
                            l: Array.isArray(line.l) ? line.l.map((word: any): RichSyncWord => ({
                                ...word,
                                o: typeof word.o === 'number' ? word.o : 0
                            })) : [{ c: line.x || "Unknown", o: 0 }]
                        }));
                    } else {
                        subtitles = subtitles.map((line: RichSyncLine): RichSyncLine => ({
                            ...line,
                            ts: line.ts * 1000,
                            te: line.te * 1000
                        }));
                    }
                } catch (e) {
                    console.error("Error parsing richsync data (ISRC):", e);
                    subtitles = [{ text: "Error parsing richsync data" }];
                    lyricsType = null;
                }
            } else if (lyricsType === 'subtitle') {
                subtitles = JSON.parse(data.message.body.subtitle.subtitle_body);
                subtitles = subtitles.map((line: SubtitleLine): SubtitleLine => ({
                    ...line,
                    time: { total: line.time.total * 1000 }
                }));
            } else {
                subtitles = [{ text: "Unknown lyrics format" }];
                lyricsType = null;
            }
            resetPlayback();
        }).catch(error => {
            console.error("Error in parseLyricsByISRC:", error);
            subtitles = [{ text: "ERROR fetching lyrics by ISRC after retries" }];
            lyricsType = null;
        });
    }

    function parseLyricsByQuery(query: string) {
        // Similar to parseLyrics but uses query
        getLyricsByQuery(query).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics by query" }];
                lyricsType = null;
                return;
            }

            // Extract track info from the response for direct lyrics
            if (data.message.body.track_info) {
                trackName = data.message.body.track_info.track_name || null;
                artistName = data.message.body.track_info.artist_name || null;
            }

            lyricsType = data.type;
            console.log(`Lyrics type received (query): ${lyricsType}`);

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
                            l: Array.isArray(line.l) ? line.l.map((word: any): RichSyncWord => ({
                                ...word,
                                o: typeof word.o === 'number' ? word.o : 0
                            })) : [{ c: line.x || "Unknown", o: 0 }]
                        }));
                    } else {
                        subtitles = subtitles.map((line: RichSyncLine): RichSyncLine => ({
                            ...line,
                            ts: line.ts * 1000,
                            te: line.te * 1000
                        }));
                    }
                } catch (e) {
                    console.error("Error parsing richsync data (query):", e);
                    subtitles = [{ text: "Error parsing richsync data" }];
                    lyricsType = null;
                }
            } else if (lyricsType === 'subtitle') {
                subtitles = JSON.parse(data.message.body.subtitle.subtitle_body);
                subtitles = subtitles.map((line: SubtitleLine): SubtitleLine => ({
                    ...line,
                    time: { total: line.time.total * 1000 }
                }));
            } else {
                subtitles = [{ text: "Unknown lyrics format" }];
                lyricsType = null;
            }
            resetPlayback();
        }).catch(error => {
            console.error("Error in parseLyricsByQuery:", error);
            subtitles = [{ text: "ERROR fetching lyrics by query after retries" }];
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
        // Remove existing active, passed, and word classes for lines and words
        document.querySelectorAll(".active, .active-word, .passed, .passed-word").forEach(el => {
            el.classList.remove("active", "active-word", "passed", "passed-word");
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
        document.querySelectorAll(".active, .active-word, .passed, .passed-word").forEach(el => {
            el.classList.remove("active", "active-word", "passed", "passed-word");
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
                // Mark previous line as passed (instead of removing active)
                if (currentLyricIndex !== -1) {
                    const oldLineEl = document.querySelector(`#lyrics [data-index="${currentLyricIndex}"]`);
                    oldLineEl?.classList.remove("active");
                    oldLineEl?.classList.add("passed");
                    // Keep word highlighting on passed lines - don't remove active-word class
                    oldLineEl?.querySelectorAll('.lyric-word').forEach(wordEl => {
                        if (wordEl.classList.contains('active-word')) {
                            wordEl.classList.add('passed-word');
                        }
                    });
                }

                // Add active class to the new line
                if (newActiveLineIndex !== -1) {
                    const newLineEl = document.querySelector(`#lyrics [data-index="${newActiveLineIndex}"]`);
                    newLineEl?.classList.add("active");
                    newLineEl?.classList.remove("passed"); // Remove passed class if going backwards
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
                        
                        // Add active class to all words from beginning up to and including the new active word
                        if (newActiveWordIndex !== -1) {
                            for (let k = 0; k <= newActiveWordIndex; k++) {
                                const wordEl = document.querySelector(`.lyric-word[data-line-index="${currentLyricIndex}"][data-word-index="${k}"]`);
                                if (wordEl) {
                                    wordEl.classList.add('active-word');
                                }
                            }
                            console.log(`Highlighted words 0 through ${newActiveWordIndex} in line ${currentLyricIndex}`);
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

    const parseToken = async () => { // Make async
        const fetchedToken = await tryGetInitialToken(); // Use the new helper

        if (fetchedToken) {
            token = fetchedToken; // Set the global token (may still be useful for display or other logic)
            (document.getElementById("submit") as HTMLInputElement)!.disabled = false;
            document.getElementById("error-musixmatch")!.style.display = "none";
            localStorage.setItem("token", token); // Store the working token
            console.log("Initial token obtained and stored.");
        } else {
            // No token fetched, try localStorage
            const storedToken = localStorage.getItem("token");
            if (storedToken) {
                token = storedToken; // Use stored token
                console.warn("Musixmatch token fetch failed, but a localStorage alternative is available. Using stored token.");
                document.getElementById("error-musixmatch")!.style.display = "none";
                (document.getElementById("submit") as HTMLInputElement)!.disabled = false;
                // Optionally schedule another attempt later if the stored token might expire
                // setTimeout(parseToken, 300000); // e.g., try again in 5 minutes
            } else {
                // No token fetched and none in storage - try fallback token for initial load?
                // For now, stick to original logic: disable search and show error.
                console.error("Musixmatch token cannot be accessed and no localStorage alternative. Search disabled.");
                document.getElementById("error-musixmatch")!.style.display = "block";
                (document.getElementById("submit") as HTMLInputElement)!.disabled = true; // Keep disabled
                // Retry fetching token periodically
                setTimeout(parseToken, 5000); // Retry sooner if completely blocked initially
            }
        }
    };

    onMount(() => {
        // Check for URL parameters first
        const urlParams = new URLSearchParams(window.location.search);
        const trackId = urlParams.get('id');
        const isrc = urlParams.get('isrc');
        const query = urlParams.get('q');

        // If any direct parameter is found, set flags and load lyrics directly
        if (trackId || isrc || query) {
            hideSearchBar = true;
            transparentBackground = true;
            directLyrics = true;
            
            // Apply transparent background class to body
            document.body.classList.add('transparent-bg');
            
            // Load lyrics directly based on parameter type
            if (trackId) {
                const id = parseInt(trackId);
                if (!isNaN(id)) {
                    parseLyrics(id);
                }
            } else if (isrc) {
                parseLyricsByISRC(isrc);
            } else if (query) {
                parseLyricsByQuery(query);
            }
        }

        checkForScroll();
        (document.getElementById("submit") as HTMLInputElement)!.disabled = true; // disable the search button
        parseToken(); // Call the async function
        
        document.getElementById("artistForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            currentPage = 1;
            searchPerformed = false; // Reset flags before search
            searchError = false;
            info = []; // Clear previous results
            // searchSong now uses fetchWithRetry
            searchSong((<HTMLInputElement>document.getElementById("song"))?.value).then((data) => {
                 searchPerformed = true; // Mark search as completed
                 if (!data || data.message.header.status_code !== 200) {
                    searchError = true;
                    // Provide an empty track object matching the type structure for errors
                    info = []; // Keep info empty on error
                    console.error("Search failed or returned non-200 status code.");
                 } else {
                     info = data.message.body.track_list || []; // Ensure info is an array, even if track_list is missing/null
                 }
            }).catch(error => {
                 searchPerformed = true; // Mark search as completed even on catch
                 searchError = true;
                 console.error("Error in form submission search:", error);
                 info = []; // Keep info empty on error
            });
        });
    });
</script>

<svelte:head>
    <title>Live Lyrics</title>
    <meta name="description" content="Live lyrics for free, powered by Musixmatch! Sync to your songs and more...">
</svelte:head>

{#if !hideSearchBar}
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

<i>Add the artist into your search for best results</i><br>
<p id="error-musixmatch" style="color: #f00; display: none;">Sorry, Musixmatch is currently blocking your requests. Please wait up to 5 minutes - the issue will resolve itself.</p>
{/if}

{#if directLyrics && (trackName || artistName)}
<div class="direct-lyrics-info">
    <h2 class="track-title">{trackName || 'Unknown Track'}</h2>
    {#if artistName}
        <p class="artist-name">{artistName}</p>
    {/if}
</div>
{/if}

{#if !hideSearchBar}
{#if searchPerformed}
    {#if searchError}
        <p style="margin-left: .5rem; color: red;">Error performing search. Please try again.</p>
    {:else if info.length === 0}
        <p style="margin-left: .5rem;">No results found for your search.</p>
    {/if}
{/if}

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
    {#if info.length > 0} <!-- Only show pagination if there are results -->
        <li class="pagination">
            <!-- wonderful code here, not a pain to see -->
            <button class="searchButtons" on:click={() => { if (currentPage > 1 && info.length > 0) { searchSong(songValue, currentPage - 1).then((data) => { info = (data.message.header.status_code !== 200) ? [{ track: { track_id: 0, track_name: "ERROR", artist_name: "", album_coverart_100x100: "" } }] : data.message.body.track_list; }); currentPage -= 1; } }}><svg height="16" width="12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5 0-45.3l-160 160z"/></svg></button>
            <span>{currentPage}</span>
            <button class="searchButtons" on:click={() => { if (info.length > 0) { searchSong(songValue, currentPage + 1).then((data) => { info = (data.message.header.status_code !== 200) ? [{ track: { track_id: 0, track_name: "ERROR", artist_name: "", album_coverart_100x100: "" } }] : data.message.body.track_list; }); currentPage += 1; }}}><svg height="16" width="12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 0-45.3l160 160z"/></svg></button>
        </li>
    {/if}
</ul>
{/if}

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
    <p style="font-size: 1rem">To sync to a line, click on it. Press 'Play lyrics' to begin the logic</p>
    {#if subtitles.length > 0}
        {#if lyricsType === 'richsync'}
            {#each subtitles as line, i}
                <!-- A11y: Added role, tabindex, and keydown handler -->
                <div 
                    class="lyric-line" 
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
                <!-- A11y: Added role, tabindex, and keydown handler -->
                <div 
                    class="lyric-line" 
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
            <!-- Handle error or unknown type -->
            <p>{subtitles[0]?.text || "Loading lyrics..."}</p>
        {/if}
        
        <!-- Footer separator and links -->
        {#if subtitles.length > 0}
            <div class="lyrics-footer">
                <hr class="lyrics-separator">
                <div class="footer-links">
                    <a href="https://lyrics.binimum.org" target="_blank" rel="noopener noreferrer">lyrics.binimum.org</a>
                    <div class="source-text">Source: Musixmatch</div>
                </div>
            </div>
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

        :global(body.transparent-bg) {
            background: transparent !important;
        }

        .direct-lyrics-info {
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2));
            border-color: rgba(0, 0, 0, 0.3);
        }

        .track-title {
            background: linear-gradient(135deg, #4a9eff, #a865ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .searchButtons {
            background: rgba(40, 40, 40, 0.8) !important;
            border-color: rgba(255, 255, 255, 0.2) !important;
            color: white !important;
            
            &:hover {
                border-color: #4a9eff !important;
                background: rgba(50, 50, 50, 0.9) !important;
            }
        }

        #artistForm {
            background: rgba(40, 40, 40, 0.9);
            border-bottom-color: rgba(255, 255, 255, 0.1);
            
            label svg {
                fill: #4a9eff !important;
                opacity: 0.9;
            }
            
            #song {
                background: rgba(40, 40, 40, 0.9) !important;
                color: white;
                border-color: rgba(0, 0, 0, 0.3);
                
                &:focus {
                    border-color: #4a9eff;
                    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.2);
                }
            }
        }

        #playButton {
            color: white;
            background: linear-gradient(135deg, #4a9eff, #3d7acc);
            box-shadow: 0 4px 12px rgba(120, 120, 120, 0.25);
            
            &:hover {
                box-shadow: 0 6px 20px rgba(100, 100, 100, 0.3);
            }
        }

        svg {
            filter: invert(100%);
        }
        
        #playButton svg, #artistForm #submit svg {
            filter: none !important;
        }

        /* Dark mode shadow effects for lyrics */
        #lyrics div.lyric-line .lyric-word {
            text-shadow: 0 1px 3px rgba(255, 255, 255, 0.1) !important; /* Light white shadow for dark mode */
        }

        #lyrics div.lyric-line:not(.active) .lyric-word {
            text-shadow: 0 1px 2px rgba(255, 255, 255, 0.05) !important; /* Very light white shadow for inactive words */
        }

        :global(.lyric-word.active-word) {
            text-shadow: 0 3px 12px rgba(140, 140, 140, 0.5), 0 2px 6px rgba(160, 160, 160, 0.3), 0 1px 3px rgba(180, 180, 180, 0.2) !important; /* Enhanced lighter gray shadow for active word in dark mode */
        }

        /* Words around the active word get enhanced glow in dark mode */
        :global(.lyric-word.active-word) + .lyric-word,
        .lyric-word:has(+ :global(.lyric-word.active-word)) {
            text-shadow: 0 2px 6px rgba(150, 150, 150, 0.25), 0 1px 3px rgba(170, 170, 170, 0.15) !important;
        }

        :global(.lyric-line.active) {
            text-shadow: 0 2px 8px rgba(130, 130, 130, 0.3), 0 1px 4px rgba(150, 150, 150, 0.2) !important;
        }

        :global(.lyric-line.passed) {
            text-shadow: 0 1px 4px rgba(136, 136, 136, 0.4), 0 1px 2px rgba(255, 255, 255, 0.1) !important;
        }

        :global(.lyric-word.passed-word) {
            text-shadow: 0 1px 4px rgba(136, 136, 136, 0.4), 0 1px 2px rgba(255, 255, 255, 0.1) !important;
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
        &:focus {
            outline: 2px solid dodgerblue; /* Add focus outline for accessibility */
            outline-offset: 2px;
        }
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
        transition: all 0.3s ease-out;
        text-shadow: 0 1px 3px rgba(120, 120, 120, 0.3); /* Light gray shadow for all words */
    }

    /* Words in non-active lines have lower opacity */
    #lyrics div.lyric-line:not(.active) .lyric-word {
        opacity: 0.4;
        text-shadow: 0 1px 2px rgba(150, 150, 150, 0.2); /* Very light gray shadow for inactive words */
    }
    
    /* Active word styling - Apple Music style with full opacity and enhanced shadow */
    :global(.lyric-word.active-word) {
        opacity: 1 !important; /* Full opacity for active word */
        font-weight: bold !important;
        color: inherit !important;
        text-shadow: 0 3px 12px rgba(100, 100, 100, 0.4), 0 2px 6px rgba(120, 120, 120, 0.3), 0 1px 3px rgba(140, 140, 140, 0.2) !important; /* Multi-layered lighter gray shadow for active word */
        transform: translateY(-1px) !important; /* Slight lift effect */
        transition: all 0.15s ease-out !important;
    }

    /* Words around the active word get a subtle glow */
    :global(.lyric-word.active-word) + .lyric-word,
    .lyric-word:has(+ :global(.lyric-word.active-word)) {
        text-shadow: 0 2px 6px rgba(130, 130, 130, 0.25), 0 1px 3px rgba(150, 150, 150, 0.15) !important;
        opacity: 0.8 !important;
        transition: all 0.3s ease-out !important;
    }

    /* Active line gets enhanced shadow */
    :global(.lyric-line.active) {
        text-shadow: 0 2px 8px rgba(110, 110, 110, 0.3), 0 1px 4px rgba(130, 130, 130, 0.2) !important;
        transform: translateY(-0.5px) !important;
        transition: all 0.2s ease-out !important;
    }

    /* Passed line styling - keep bold but make gray with subtle shadow */
    :global(.lyric-line.passed) {
        color: #888 !important; /* Gray color for passed lines */
        font-weight: bold !important; /* Keep bold */
        text-shadow: 0 1px 4px rgba(136, 136, 136, 0.3), 0 1px 2px rgba(160, 160, 160, 0.15) !important; /* Lighter gray shadow for passed lines */
        transform: translateY(0) !important;
    }

    /* Passed word styling - keep bold but make gray with subtle shadow */
    :global(.lyric-word.passed-word) {
        opacity: 1 !important; /* Full opacity for passed words */
        font-weight: bold !important; /* Keep bold */
        color: #888 !important; /* Gray color for passed words */
        text-shadow: 0 1px 4px rgba(136, 136, 136, 0.3), 0 1px 2px rgba(160, 160, 160, 0.15) !important; /* Lighter gray shadow for passed words */
        transform: translateY(0) !important;
        transition: all 0.2s ease-in !important;
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

    /* Transparent background mode for direct lyrics loading */
    :global(body.transparent-bg) {
        background: transparent !important;
    }

    /* Direct lyrics info styling */
    .direct-lyrics-info {
        text-align: center;
        margin: 1rem 0 2rem 0;
        padding: 1rem;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.1));
        border: 1px solid rgba(0, 0, 0, 0.2);
    }

    .track-title {
        font-size: 2rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        background: linear-gradient(135deg, #0873ff, #8b45ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .artist-name {
        font-size: 1.2rem;
        margin: 0;
        opacity: 0.8;
        font-weight: 500;
    }

    /* Improved search results styling */
    .searchButtons {
        padding: 1rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        color: black;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(120, 120, 120, 0.15);
            border-color: #0873ff;
        }
        
        img {
            border-radius: 8px;
        }
        div {
            text-align: left;
        }
    }

    /* Enhanced play button styling */
    #playButton {
        padding: 1rem 1.5rem;
        margin-left: .5rem;
        border-radius: 12px;
        background: linear-gradient(135deg, #0873ff, #0066cc);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: .75rem;
        font-size: 1.1em;
        color: white;
        border: none;
        margin-top: 1rem;
        font-weight: 600;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(120, 120, 120, 0.25);
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        }
        
        svg {
            filter: invert(1) !important;
        }
    }

    /* Modern form styling */
    #artistForm {
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(10px);
        border-radius: 16px 16px 0 0;
        padding: 1rem;
        margin-bottom: 1rem;
        
        div {
            align-items: center;
            justify-content: center;
            display: flex;
            gap: .5rem;
        }
        
        #submit {
            width: 100%;
            border-radius: 12px;
            padding: 1rem;
            font-size: 1.1em;
            border: 0;
            color: white;
            background: linear-gradient(135deg, #0873ff, #0066cc);
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(120, 120, 120, 0.25);
            
            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(100, 100, 100, 0.3);
            }
            &:disabled {
                transform: none !important;
                background: #afafaf !important;
                box-shadow: none !important;
                cursor: not-allowed;
            }
        }
        
        svg {
            height: 1.25em;
            margin-left: 1rem;
            width: 1.25em;
            opacity: 1;
            fill: white;
        }
        
        label svg {
            height: 1.5em;
            width: 1.5em;
            opacity: 0.7;
            fill: #0873ff;
            transition: all 0.2s ease;
        }
        
        #song {
            margin: 0;
            max-width: 100%;
            overflow: hidden;
            border-radius: 12px;
            position: sticky;
            top: 0;
            left: 0;
            border: 2px solid rgba(0, 0, 0, 0.2);
            font-size: 1.8em;
            outline: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(15px);
            margin-left: 5px;
            padding: 0.75rem 1rem;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 12px rgba(140, 140, 140, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05);
            
            &:focus {
                border-color: #0873ff;
                box-shadow: 0 0 0 3px rgba(120, 120, 120, 0.15), 0 4px 20px rgba(130, 130, 130, 0.12);
                transform: translateY(-1px);
            }
            
            &:hover {
                border-color: rgba(8, 115, 255, 0.4);
                box-shadow: 0 3px 15px rgba(110, 110, 110, 0.1), 0 1px 4px rgba(0, 0, 0, 0.08);
            }
        }
        
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
    }

    /* Lyrics footer styling */
    .lyrics-footer {
        margin-top: 3rem;
        padding: 1rem 0;
    }

    .lyrics-separator {
        border: none;
        height: 1px;
        background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.1), transparent);
        margin: 2rem 0 1.5rem 0;
    }

    .footer-links {
        text-align: center;
        font-size: 0.9rem;
        color: #666;
        line-height: 1.6;
    }

    .footer-links a {
        color: #0873ff;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s ease;
    }

    .footer-links a:hover {
        color: #0066cc;
        text-decoration: underline;
    }

    .source-text {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        opacity: 0.8;
    }

    /* Dark mode footer styling */
    @media (prefers-color-scheme: dark) {
        .lyrics-separator {
            background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.15), transparent);
        }

        .footer-links {
            color: #aaa;
        }

        .footer-links a {
            color: #4a9eff;
        }

        .footer-links a:hover {
            color: #66b3ff;
        }
    }
</style>
