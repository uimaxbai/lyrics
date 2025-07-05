<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import Switch from './Switch.svelte';
    import { getSyncedTime, ensureTimeSynced } from '../lib/timeSync';

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
    let playbackAnimationId: number | null = null; // Use requestAnimationFrame
    let isPlaying = false; // Add isPlaying state
    let isSyncing = false; // Add isSyncing state for time sync

    let selectedTrack: TrackInfo['track'] | null = null;

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
            try {
                // 1. Fetch token for the random prefix
                const tokenResponse = await fetch(`${randomPrefix}/getToken`);
                if (!tokenResponse.ok) {
                    throw new Error(`Token fetch failed for random ${randomPrefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
                }
                const tokenData = await tokenResponse.json();
                if (tokenData?.message?.header?.status_code !== 200 || !tokenData?.message?.body?.user_token) {
                    throw new Error(`Invalid token data or error status code from random ${randomPrefix}: ${tokenData?.message?.header?.status_code}`);
                }
                const currentToken = tokenData.message.body.user_token;

                // 2. Construct URL for the actual request using the new token
                const urlObject = new URL(randomPrefix + basePathWithQuery, window.location.origin);
                urlObject.searchParams.set('token', currentToken);
                const fullUrl = urlObject.toString();

                // 3. Fetch the actual data using the obtained token
                const response = await fetch(fullUrl);
                if (!response.ok) {
                    throw new Error(`Data fetch failed for random ${fullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                // 4. Check the body status code for the data response
                if (data?.message?.header?.status_code === 200) {
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
        for (const prefix of apiPrefixes) {
            try {
                // ... (rest of the token fetching and data fetching logic as before)
                const tokenResponse = await fetch(`${prefix}/getToken`);
                if (!tokenResponse.ok) {
                    throw new Error(`Token fetch failed for ${prefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
                }
                const tokenData = await tokenResponse.json();
                if (tokenData?.message?.header?.status_code !== 200 || !tokenData?.message?.body?.user_token) {
                    throw new Error(`Invalid token data or error status code from ${prefix}: ${tokenData?.message?.header?.status_code}`);
                }
                const currentToken = tokenData.message.body.user_token;

                const urlObject = new URL(prefix + basePathWithQuery, window.location.origin);
                urlObject.searchParams.set('token', currentToken);
                const fullUrl = urlObject.toString();

                const response = await fetch(fullUrl);
                if (!response.ok) {
                    throw new Error(`Data fetch failed for ${fullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                if (data?.message?.header?.status_code === 200) {
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
        for (const fallbackPrefix of apiPrefixes) {
            try {
                // ... (rest of the hardcoded token logic as before)
                const fallbackUrlObject = new URL(fallbackPrefix + basePathWithQuery, window.location.origin);
                fallbackUrlObject.searchParams.set('token', hardcodedToken);
                const fallbackFullUrl = fallbackUrlObject.toString();

                const response = await fetch(fallbackFullUrl);
                if (!response.ok) {
                    throw new Error(`Fallback data fetch failed for ${fallbackFullUrl}: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();

                if (data?.message?.header?.status_code === 200) {
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
             // Add the full track object for the header display
            lyricsData.message.body.track_list = searchData.message.body.track_list;
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
             // Add the full track object for the header display
            lyricsData.message.body.track_list = searchData.message.body.track_list;
        }
        
        return lyricsData;
    }

    // Removed the standalone getToken function as fetchWithRetry handles token fetching internally for data requests.

    // Helper function to try getting an initial token from any prefix
    async function tryGetInitialToken() {
        for (const prefix of apiPrefixes) {
            try {
                const tokenResponse = await fetch(`${prefix}/getToken`);
                if (!tokenResponse.ok) {
                    throw new Error(`Initial token fetch failed for ${prefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
                }
                const tokenData = await tokenResponse.json();
                if (tokenData?.message?.header?.status_code === 200 && tokenData?.message?.body?.user_token) {
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

    /**
     * Helper function to parse the body of a lyrics API response.
     * @param responseBody The `message.body` of the API response.
     * @returns True if parsing was successful, false otherwise.
     */
    function _parseLyricsResponse(responseBody: any): boolean {
        if (!responseBody) {
            subtitles = [{ text: "ERROR: Invalid response body." }];
            lyricsType = null;
            return false;
        }

        // Check for explicit no-lyrics flags
        if (responseBody.subtitle?.subtitle_body === '[]' && responseBody.richsync?.richsync_body === '[]') {
            subtitles = [{ text: "No lyrics found for this song." }];
            lyricsType = null;
            return true; // Technically a success, just no lyrics
        }

        const type = responseBody.richsync?.richsync_body !== '[]' ? 'richsync' : 
                     responseBody.subtitle?.subtitle_body !== '[]' ? 'subtitle' : null;

        lyricsType = type;

        try {
            if (lyricsType === 'richsync') {
                let parsed = JSON.parse(responseBody.richsync.richsync_body);
                let validStructure = Array.isArray(parsed) && parsed.length > 0 &&
                                     typeof parsed[0].ts === 'number' &&
                                     typeof parsed[0].te === 'number' &&
                                     Array.isArray(parsed[0].l);

                if (!validStructure) {
                    // Fallback for unexpected structure
                    subtitles = parsed.map((line: any): RichSyncLine => ({
                        ...line,
                        ts: (typeof line.ts === 'number' ? line.ts : 0) * 1000,
                        te: (typeof line.te === 'number' ? line.te : 5000) * 1000,
                        l: Array.isArray(line.l) ? line.l.map((word: any): RichSyncWord => ({ ...word, o: typeof word.o === 'number' ? word.o : 0 })) : [{ c: line.x || "Unknown", o: 0 }]
                    }));
                } else {
                    subtitles = parsed.map((line: RichSyncLine): RichSyncLine => ({
                        ...line,
                        ts: line.ts * 1000,
                        te: line.te * 1000
                    }));
                }
            } else if (lyricsType === 'subtitle') {
                let parsed = JSON.parse(responseBody.subtitle.subtitle_body);
                subtitles = parsed.map((line: SubtitleLine): SubtitleLine => ({
                    ...line,
                    time: { total: line.time.total * 1000 }
                }));
            } else {
                subtitles = [{ text: "No synchronized lyrics available for this song." }];
                return true;
            }
            return true;
        } catch (e) {
            console.error("Error parsing lyrics data:", e);
            subtitles = [{ text: "Error parsing lyrics data." }];
            lyricsType = null;
            return false;
        }
    }


    function parseLyrics(track: TrackInfo['track']) {
        selectedTrack = track;
        getLyrics(track.track_id).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics" }];
                lyricsType = null;
                return;
            }
            _parseLyricsResponse(data.message.body);
            resetPlayback();

            // Scroll to lyrics on mobile after selection
            if (window.innerWidth < 768) {
                document.querySelector('.lyrics-container')?.scrollIntoView({ behavior: 'smooth' });
            }
        }).catch(error => {
            console.error("Error in parseLyrics:", error);
            subtitles = [{ text: "ERROR fetching lyrics after retries" }];
            lyricsType = null;
        });
    }

    function parseLyricsById(id: number) {
        getLyrics(id).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics" }];
                lyricsType = null;
                return;
            }
            // We don't have track info here, so we can't set selectedTrack
            _parseLyricsResponse(data.message.body);
            resetPlayback();
        }).catch(error => {
            console.error("Error in parseLyricsById:", error);
            subtitles = [{ text: "ERROR fetching lyrics after retries" }];
            lyricsType = null;
        });
    }

    function parseLyricsByISRC(isrc: string) {
        getLyricsByISRC(isrc).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics by ISRC" }];
                lyricsType = null;
                return;
            }
            if (data.message.body.track_info) {
                trackName = data.message.body.track_info.track_name || null;
                artistName = data.message.body.track_info.artist_name || null;
            }
            if (data.message.body.track_list && data.message.body.track_list.length > 0) {
                selectedTrack = data.message.body.track_list[0].track;
            }
            _parseLyricsResponse(data.message.body);
            resetPlayback();
        }).catch(error => {
            console.error("Error in parseLyricsByISRC:", error);
            subtitles = [{ text: "ERROR fetching lyrics by ISRC after retries" }];
            lyricsType = null;
        });
    }

    function parseLyricsByQuery(query: string) {
        getLyricsByQuery(query).then((data) => {
            if (!data || data.message.header.status_code !== 200) {
                subtitles = [{ text: "ERROR fetching lyrics by query" }];
                lyricsType = null;
                return;
            }
            if (data.message.body.track_info) {
                trackName = data.message.body.track_info.track_name || null;
                artistName = data.message.body.track_info.artist_name || null;
            }
            if (data.message.body.track_list && data.message.body.track_list.length > 0) {
                selectedTrack = data.message.body.track_list[0].track;
            }
            _parseLyricsResponse(data.message.body);
            resetPlayback();
        }).catch(error => {
            console.error("Error in parseLyricsByQuery:", error);
            subtitles = [{ text: "ERROR fetching lyrics by query after retries" }];
            lyricsType = null;
        });
    }

    function prevPage() {
        if (currentPage > 1) {
            const previousPage = currentPage;
            currentPage -= 1;
            searchSong(songValue, currentPage).then((data) => {
                if (data && data.message.header.status_code === 200) {
                    info = data.message.body.track_list || [];
                } else {
                    info = [];
                    console.error("Failed to fetch previous page.");
                    currentPage = previousPage; // Revert page number on error
                }
            }).catch(() => {
                currentPage = previousPage; // Revert page number on error
            });
        }
    }

    function nextPage() {
        if (info.length > 0) { // This condition might need adjustment based on API behavior for last page
            const previousPage = currentPage;
            currentPage += 1;
            searchSong(songValue, currentPage).then((data) => {
                if (data && data.message.header.status_code === 200 && data.message.body.track_list.length > 0) {
                    info = data.message.body.track_list || [];
                } else {
                    console.error("Failed to fetch next page or no results on page.");
                    currentPage = previousPage; // Revert page number
                }
            }).catch(() => {
                currentPage = previousPage; // Revert page number on error
            });
        }
    }

    function resetPlayback() {
        isPlaying = false; // Stop playback
        then = 0;
        currentLyricIndex = -1;
        currentWordIndex = -1; // Reset word index too
        // Clear existing animation frame if it's running
        if (playbackAnimationId) {
            cancelAnimationFrame(playbackAnimationId);
            playbackAnimationId = null;
        }
        // Remove existing active, passed, and word classes for lines and words
        document.querySelectorAll(".active, .active-word, .passed, .passed-word").forEach(el => {
            el.classList.remove("active", "active-word", "passed", "passed-word");
        });
    }

    function pauseLyrics() {
        isPlaying = false;
        if (playbackAnimationId) {
            cancelAnimationFrame(playbackAnimationId);
            playbackAnimationId = null;
        }
    }

    async function playLyrics() {
        if (!subtitles || subtitles.length === 0 || !lyricsType) return;

        // Ensure time is synced before starting playback. Show syncing indicator.
        isSyncing = true;
        try {
            await ensureTimeSynced();
        } catch (error) {
            console.error("Time sync failed, playback may be inaccurate.", error);
            // Proceeding with local time as a fallback.
        } finally {
            isSyncing = false;
        }

        // Set playing state
        isPlaying = true;

        // Clear any existing animation frame before starting a new one
        if (playbackAnimationId) {
            cancelAnimationFrame(playbackAnimationId);
            playbackAnimationId = null;
        }

        // If 'then' is not set (i.e., starting from the beginning), set it.
        if (then === 0) {
            then = getSyncedTime();
        }

        // Ensure highlighting is cleared before starting
        if (currentLyricIndex === -1) {
            document.querySelectorAll(".active, .active-word, .passed, .passed-word").forEach(el => {
                el.classList.remove("active", "active-word", "passed", "passed-word");
            });
        }

        const animationStep = () => {
            if (!isPlaying) return; // Stop the loop if paused
f
            const now = getSyncedTime();
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
                    // When a line is finished, ensure all its words are marked as passed.
                    oldLineEl?.querySelectorAll('.lyric-word').forEach(wordEl => {
                        wordEl.classList.add('passed-word');
                        wordEl.classList.remove('active-word'); // Clean up active state
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

                    let newActiveWordIndex = -1;
                    // Find the last word whose offset is less than or equal to the time within the line
                    for (let j = 0; j < currentLine.l.length; j++) {
                        const wordOffsetMs = currentLine.l[j].o * 1000;
                        if (wordOffsetMs <= timeWithinLine) {
                            newActiveWordIndex = j;
                        } else {
                            break; // Words are ordered by offset
                        }
                    }

                    if (newActiveWordIndex !== currentWordIndex) {
                        const lineWords = document.querySelectorAll(`.lyric-word[data-line-index="${currentLyricIndex}"]`);

                        // Update classes for all words in the current line based on the new index
                        lineWords.forEach((wordEl, k) => {
                            if (k < newActiveWordIndex) {
                                wordEl.classList.add('passed-word');
                                wordEl.classList.remove('active-word');
                            } else if (k === newActiveWordIndex) {
                                wordEl.classList.add('active-word');
                                wordEl.classList.remove('passed-word');
                            } else {
                                wordEl.classList.remove('active-word', 'passed-word');
                            }
                        });
                        
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

            if (endOfLyrics) {
                 if (playbackAnimationId) {
                    cancelAnimationFrame(playbackAnimationId);
                    playbackAnimationId = null;
                 }
                 // Optionally reset highlighting after a short delay
                 // setTimeout(resetPlayback, 1000);
            } else {
                playbackAnimationId = requestAnimationFrame(animationStep);
            }

        };
        
        playbackAnimationId = requestAnimationFrame(animationStep);
    }

    /** Function to sync playback to a specific time */
    async function syncPlayback(startTimeMs: number) {
        if (!subtitles || subtitles.length === 0) return;

        // Calculate the new 'then' value to make the current time match the desired startTimeMs
        const now = getSyncedTime();
        then = now - startTimeMs;

        // Always clear any existing animation frame and restart playback from the new time
        if (playbackAnimationId) {
            cancelAnimationFrame(playbackAnimationId);
        }
        
        // Call playLyrics to start/restart the animation with the adjusted 'then' value
        await playLyrics(); 
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
                    parseLyricsById(id);
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

<div class="main-container">
    <div class="sidebar">
        {#if !hideSearchBar}
        <form id="artistForm" method="post">
            <div class="search-input-container">
                <label for="song" class="visually-hidden">Search for a song</label>
                <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512" aria-hidden="true"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path fill="currentColor" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>
                <input type="text" bind:value={songValue} autocorrect="off" autocapitalize="off" name="song" required id="song" placeholder="Song, lyrics, artist..." spellcheck="false">
            </div>
            <button id="submit" type="submit">Search</button>
        </form>

        <div class="search-info">
            <i>Add the artist into your search for best results</i><br>
            <p id="error-musixmatch" style="color: #f00; display: none;">Sorry, we're having trouble connecting to the lyrics service. This should resolve itself in a few moments.</p>
        </div>
        {/if}

        {#if searchPerformed}
            {#if searchError}
                <p class="search-status-message error">Error performing search. Please try again.</p>
            {:else if info.length === 0}
                <p class="search-status-message">No results found for your search.</p>
            {/if}
        {/if}

        <ul id="searchResults">
            {#each info as thing, i}
                <li>
                    <button class="searchButtons" on:click={() => parseLyrics(thing.track)}>
                        <img src={thing.track.album_coverart_100x100.replace("http", "https").replace("httpss", "https")} alt="Cover image of {thing.track.track_name}" width="50" height="50">
                        <div class="track-details">
                            <b>{thing.track.track_name}</b>
                            <br />
                            <span>{thing.track.artist_name}</span>
                        </div>
                    </button>
                </li>
            {/each}
            {#if info.length > 0} <!-- Only show pagination if there are results -->
                <li class="pagination">
                    <button class="pagination-button" on:click={prevPage} disabled={currentPage <= 1} aria-label="Previous page"><svg height="16" width="12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" aria-hidden="true"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path fill="currentColor" d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160-160z"/></svg></button>
                    <span>{currentPage}</span>
                    <button class="pagination-button" on:click={nextPage} disabled={info.length === 0} aria-label="Next page"><svg height="16" width="12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" aria-hidden="true"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path fill="currentColor" d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/></svg></button>
                </li>
            {/if}
        </ul>
    </div>

    <div class="lyrics-container">
        {#if directLyrics && (trackName || artistName) && !selectedTrack}
        <div class="direct-lyrics-info">
            <h2 class="track-title">{trackName || 'Unknown Track'}</h2>
            {#if artistName}
                <p class="artist-name">{artistName}</p>
            {/if}
        </div>
        {/if}

        <div class="playback-controls">
            <button id="playButton" on:click={() => { 
                if (isPlaying) {
                    pauseLyrics();
                } else {
                    playLyrics(); 
                }
            }} disabled={isSyncing}>
                {#if isSyncing}
                    Syncing...
                {:else if isPlaying}
                    <svg xmlns="http://www.w3.org/2000/svg" height="16" width="12" viewBox="0 0 320 512" aria-hidden="true"><path fill="currentColor" d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"/></svg>
                    Pause lyrics
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" height="16" width="12" viewBox="0 0 384 512" aria-hidden="true"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path fill="currentColor" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>
                    Play lyrics
                {/if}
            </button>
            <Switch fontSize={24} bind:value={autoScroll} design="slider" label="Auto-scroll" />
        </div>

        <div id="lyrics">
            {#if selectedTrack}
                <div class="lyrics-header">
                    <img src={selectedTrack.album_coverart_100x100.replace("http", "https").replace("httpss", "https")} alt="Cover image of {selectedTrack.track_name}" width="80" height="80">
                    <div>
                        <h2>{selectedTrack.track_name}</h2>
                        <p>{selectedTrack.artist_name}</p>
                    </div>
                </div>
            {/if}
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
                {#if subtitles.length > 0 && lyricsType}
                    <div class="lyrics-footer">
                        <hr class="lyrics-separator">
                        <div class="footer-links">
                            <a href="https://lyrics.binimum.org" target="_blank" rel="noopener noreferrer">lyrics.binimum.org</a>
                            <div class="source-text">Source: Musixmatch</div>
                        </div>
                    </div>
                {/if}
            {:else if searchPerformed}
                 <p class="no-lyrics-placeholder">Select a song to see lyrics.</p>
            {:else}
                <div class="welcome-placeholder">
                    <h2>Welcome to Live Lyrics</h2>
                    <p>Search for a song to get started.</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style lang="scss">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
    :global(body) {
        margin: 0;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif!important;
        
        /* Light Mode Variables */
        --bg-color: #fff;
        --text-color: #212121;
        --border-color: #eee;
        --sidebar-bg: #fff;
        --button-bg: #0873ff;
        --button-text: #fff;
        --button-bg-secondary: #f9f9f9;
        --highlight-bg: #f0f0f0;
        --highlight-bg-hover: #e0e0e0;
        --secondary-text: #555;

        background-color: var(--bg-color);
        color: var(--text-color);

        /* svelte-ignore css-unused-selector */
        &.transparent-bg {
            background-color: transparent;
        }
    }

    @media (prefers-color-scheme: dark) {
        :global(body) {
            --bg-color: #121212;
            --text-color: #e0e0e0;
            --border-color: #333;
            --sidebar-bg: #1a1a1a;
            --button-bg: #1e88e5;
            --button-text: #fff;
            --secondary-text: #aaa;
            --highlight-bg: #2a2a2a;
            --button-bg-secondary: #2a2a2a; /* Dark mode secondary button */
            --highlight-bg-hover: #333; /* Dark mode hover */
        }

        #song {
            color: var(--text-color);
        }

        .search-input-container {
            border-color: #444;
            background-color: #2a2a2a;
        }

        #submit {
            background-color: var(--button-bg);
            color: var(--button-text);
        }

        .searchButtons {
            &:hover {
                background-color: #333;
            }
        }

        .lyrics-header {
            border-bottom-color: var(--border-color);
        }

        .lyric-line.active {
            background-color: rgba(30, 136, 229, 0.2);
        }

        .pagination-button {
            background-color: var(--button-bg-secondary);
            color: var(--text-color);
            border-color: var(--border-color);
            &:hover:not(:disabled) {
                background-color: var(--highlight-bg-hover);
            }
        }

        .lyric-line.active {
            color: var(--secondary-text);
            font-weight: bold;
        }

        .lyric-line.passed {
            color: var(--secondary-text);
        }

        .active-word,
        .passed-word {
            color: var(--text-color);
        }
    }

    * {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif!important;
        box-sizing: border-box;
    }
    button {
        cursor: pointer;
    }

    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
    }

    .main-container {
        display: flex;
        flex-direction: column; /* Default to vertical stacking for mobile */
        height: 100vh;
        width: 100%;
    }

    .sidebar {
        width: 100%;
        padding: 1rem;
        border-bottom: 1px solid var(--border-color); /* Use variable */
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background-color: var(--sidebar-bg);
    }

    .lyrics-container {
        width: 100%;
        padding: 1rem;
        overflow-y: auto;
        flex-grow: 1; /* Allow lyrics to take remaining space */
    }

    @media (min-width: 768px) {
        .main-container {
            flex-direction: row; /* Switch to horizontal for desktop */
        }
        .sidebar {
            width: 350px;
            min-width: 350px;
            height: 100vh;
            border-right: 1px solid var(--border-color); /* Use variable */
            border-bottom: none;
        }
        .lyrics-container {
            flex-grow: 1;
            height: 100vh;
        }
    }

    #artistForm {
        display: flex; 
        flex-direction: column;
        gap: 0.5rem;
    }

    .search-input-container {
        display: flex;
        align-items: center;
        border: 1px solid var(--border-color);
        border-radius: .25rem;
        padding-left: 0.5rem;
        background-color: #fff; /* Explicit light mode bg */
        transition: background-color 0.2s, border-color 0.2s;
    }

    #song {
        border: none;
        outline: none;
        padding: 0.75rem 0.5rem;
        font-size: 1em;
        width: 100%;
        background: transparent;
        color: var(--text-color);
    }

    #submit {
        width: 100%;
        border-radius: .25rem;
        padding: .75rem;
        font-size: 1.1em;
        border: 0;
        color: var(--button-text);
        background-color: var(--button-bg);
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

    .search-info {
        font-size: 0.9rem;
        color: #666;
    }

    .search-info i {
        color: var(--secondary-text);
    }

    .search-status-message {
        margin-left: .5rem;
        &.error {
            color: red;
        }
    }

    #searchResults {
        list-style: none;
        padding: 0;
        margin: 0;
        overflow-y: auto; /* Allow scrolling if results exceed space */
        flex-grow: 1; /* Take up remaining space */
        display: flex;
        flex-direction: column;
        gap: 0.25rem; /* Add some space between search results */
    }

    .searchButtons {
        display: flex;
        align-items: center;
        gap: 1rem;
        width: 100%;
        padding: 0.5rem;
        border: none;
        background: transparent;
        text-align: left;
        border-radius: 0.25rem;
        transition: background-color 0.2s;
        color: var(--text-color);

        &:hover {
            background-color: var(--highlight-bg);
        }

        img {
            border-radius: 0.25rem;
        }
    }

    .track-details {
        b {
            color: #333;
        }
        span {
            color: #666;
            font-size: 0.9rem;
        }
    }

    .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem;
    }

    .pagination-button {
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 0.25rem;
        background-color: #f9f9f9;
        transition: background-color 0.2s;
        color: var(--text-color);

        &:hover:not(:disabled) {
            background-color: #f0f0f0;
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .playback-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;

        #playButton {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: 0.25rem;
            border: 1px solid #ddd;
            background-color: #f9f9f9;
            font-size: 1rem;
            transition: background-color 0.2s;

            &:hover {
                background-color: #f0f0f0;
            }
        }
    }

    .lyrics-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-color);

        img {
            border-radius: 0.25rem;
        }

        h2 {
            margin: 0;
            font-size: 1.5rem;
        }
        p {
            margin: 0;
            color: var(--secondary-text);
        }
    }

    .lyric-line {
        padding: 0.5rem;
        cursor: pointer;
        border-radius: 0.25rem;
        transition: background-color 0.2s ease-out, color 0.2s ease-out;

        &.active {
            font-weight: bold;
            color: var(--secondary-text);
        }

        &.passed {
            color: var(--secondary-text);
            font-weight: normal;
        }

        &:not(.active):hover {
            background-color: var(--highlight-bg);
        }
    }

    .lyric-word {
        transition: color 0.2s ease-out, background-color 0.2s ease-out;
        padding: 2px;
        margin: -2px;
        border-radius: 0.25rem;
    }

    .active-word {
        color: var(--text-color);
        font-weight: bold;
        background-color: rgba(8, 115, 255, 0.15);
    }

    .passed-word {
        color: var(--text-color);
        font-weight: normal;
        background-color: transparent;
    }

    #lyrics {
        font-size: 1.5rem;
        line-height: 1.6;

        .lyric-line {
            padding: 0.5rem;
            cursor: pointer;
            border-radius: 0.25rem;
            transition: background-color 0.2s ease-out, color 0.2s ease-out;

            &.active {
                font-weight: bold;
                color: var(--secondary-text);
            }

            &.passed {
                color: var(--secondary-text);
                font-weight: normal;
            }

            &:not(.active):hover {
                background-color: var(--highlight-bg);
            }
        }

        .lyric-word {
            transition: color 0.2s ease-out, background-color 0.2s ease-out;
            padding: 2px;
            margin: -2px;
            border-radius: 0.25rem;
        }

        .active-word {
            color: var(--text-color);
            font-weight: bold;
            background-color: rgba(8, 115, 255, 0.15);
        }

        .passed-word {
            color: var(--text-color);
            font-weight: normal;
            background-color: transparent;
        }
    }

    .lyrics-footer {
        margin-top: 2rem;
        padding-top: 1rem;
        border-top: 1px solid #eee;
        font-size: 0.8rem;
        color: #666;
        display: flex;
        justify-content: space-between;
        align-items: center;

        a {
            color: #0873ff;
            text-decoration: none;
            &:hover {
                text-decoration: underline;
            }
        }
    }

    .no-lyrics-placeholder {
        color: #999;
        text-align: center;
        margin-top: 4rem;
        font-size: 1.2rem;
    }

    .welcome-placeholder {
        color: #999;
        text-align: center;
        margin-top: 4rem;
        h2 {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }
        p {
            font-size: 1.1rem;
        }
    }

    /* Dark Mode Styles */
    @media (prefers-color-scheme: dark) {
        :global(body) {
            background-color: #121212;
            color: #e0e0e0;
        }

        .sidebar {
            background-color: #1a1a1a;
            border-bottom-color: #333;
        }

        @media (min-width: 768px) {
            .sidebar {
                border-right-color: #333;
                border-bottom-color: transparent; /* Remove bottom border on desktop */
            }
        }

        .lyrics-container {
            background-color: #121212;
        }

        #artistForm .search-input-container {
            background-color: #2a2a2a;
            border-color: #444;
            svg {
                color: #aaa;
            }
        }

        #song {
            color: #e0e0e0;
        }

        #submit {
            background-color: #1e88e5;
        }

        .search-info {
            color: #aaa;
        }

        #searchResults .searchButtons {
            background-color: #2a2a2a;
            &:hover {
                background-color: #383838;
            }
        }
        
        #searchResults .track-details b {
            color: #e0e0e0;
        }

        #searchResults .track-details span {
            color: #aaa;
        }

        #searchResults .pagination-button svg {
            color: #e0e0e0;
        }

        .lyrics-header {
            border-bottom-color: #333;
        }

        .lyrics-header h2 {
            color: #e0e0e0;
        }

        .lyrics-header p {
            color: #aaa;
        }

        .playback-controls #playButton {
            background-color: #2a2a2a;
            border-color: #444;
            color: #e0e0e0;
            &:hover {
                background-color: #383838;
            }
        }

        #lyrics .lyric-line {
            &:hover {
                background-color: #2a2a2a;
            }
            /* svelte-ignore css-unused-selector */
            &.active {
                color: #1e88e5;
            }
            /* svelte-ignore css-unused-selector */
            &.passed {
                opacity: 0.5;
            }
        }

        /* svelte-ignore css-unused-selector */
        #lyrics .lyric-word.active-word {
            color: #1e88e5;
        }

        /* svelte-ignore css-unused-selector */
        #lyrics .lyric-word.passed-word {
            color: #1e88e5;
            opacity: 0.7;
        }

        .lyrics-footer {
            border-top-color: #333;
            color: #aaa;
            a {
                color: #1e88e5;
            }
        }

        .no-lyrics-placeholder {
            color: #777;
        }

        .welcome-placeholder {
            color: #777;
        }

        #error-musixmatch {
            color: #ff5252;
        }
    }
</style>
