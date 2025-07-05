const apiPrefixes = ["/api/v1", "https://vercel.lyrics.binimum.org", "https://cloudflare.lyrics.binimum.org", "https://netlify.lyrics.binimum.org"];
const hardcodedToken = "201219dbdb0f6aaba1c774bd931d0e79a28024e28db027ae72955c";

async function fetchWithRetry(basePathWithQuery: string) {
    // --- Attempt with one randomly chosen endpoint first ---
    if (apiPrefixes.length > 0) {
        const randomIndex = Math.floor(Math.random() * apiPrefixes.length);
        const randomPrefix = apiPrefixes[randomIndex];
        try {
            const tokenResponse = await fetch(`${randomPrefix}/getToken`);
            if (!tokenResponse.ok) {
                throw new Error(`Token fetch failed for random ${randomPrefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
            }
            const tokenData = await tokenResponse.json();
            if (tokenData?.message?.header?.status_code !== 200 || !tokenData?.message?.body?.user_token) {
                throw new Error(`Invalid token data or error status code from random ${randomPrefix}: ${tokenData?.message?.header?.status_code}`);
            }
            const currentToken = tokenData.message.body.user_token;

            const urlObject = new URL(randomPrefix + basePathWithQuery, window.location.origin);
            urlObject.searchParams.set('token', currentToken);
            const fullUrl = urlObject.toString();

            const response = await fetch(fullUrl);
            if (!response.ok) {
                throw new Error(`Data fetch failed for random ${fullUrl}: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();

            if (data?.message?.header?.status_code === 200) {
                return data;
            }
            throw new Error(`API returned error in body for random ${fullUrl}: Status code ${data?.message?.header?.status_code}`);

        } catch (error) {
            console.error(`Initial random attempt with prefix ${randomPrefix} failed:`, error);
        }
    }

    // --- Sequential attempts with fetched tokens ---
    for (const prefix of apiPrefixes) {
        try {
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
        }
    }

    // --- Fallback attempts with hardcoded token ---
    for (const fallbackPrefix of apiPrefixes) {
        try {
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
        }
    }

    console.error("All API prefixes failed with random, fetched, and hardcoded tokens.");
    throw new Error("Failed to fetch data from API after trying all methods.");
}

export async function searchSong(name: string, page: number = 1) {
    const basePathWithQuery = `/searchSong?q=${encodeURIComponent(name)}&page=${page}`;
    return await fetchWithRetry(basePathWithQuery);
}

export async function getLyrics(id: number) {
    const basePathWithQuery = `/getLyrics?id=${id}`;
    return await fetchWithRetry(basePathWithQuery);
}

export async function getLyricsByISRC(isrc: string) {
    const basePathWithQuery = `/searchSong?isrc=${encodeURIComponent(isrc)}`;
    const searchData = await fetchWithRetry(basePathWithQuery);
    
    if (!searchData || searchData.message.header.status_code !== 200) {
        throw new Error("Failed to search for track by ISRC");
    }
    
    if (!searchData.message.body.track_list || searchData.message.body.track_list.length === 0) {
        throw new Error("No tracks found for the given ISRC");
    }
    
    const trackId = searchData.message.body.track_list[0].track.track_id;
    const lyricsData = await getLyrics(trackId);
    
    if (lyricsData && searchData.message.body.track_list[0].track) {
        lyricsData.message.body.track_info = {
            track_name: searchData.message.body.track_list[0].track.track_name,
            artist_name: searchData.message.body.track_list[0].track.artist_name
        };
        lyricsData.message.body.track_list = searchData.message.body.track_list;
    }
    
    return lyricsData;
}

export async function getLyricsByQuery(query: string) {
    const basePathWithQuery = `/searchSong?q=${encodeURIComponent(query)}`;
    const searchData = await fetchWithRetry(basePathWithQuery);
    
    if (!searchData || searchData.message.header.status_code !== 200) {
        throw new Error("Failed to search for track by query");
    }
    
    if (!searchData.message.body.track_list || searchData.message.body.track_list.length === 0) {
        throw new Error("No tracks found for the given query");
    }
    
    const trackId = searchData.message.body.track_list[0].track.track_id;
    const lyricsData = await getLyrics(trackId);
    
    if (lyricsData && searchData.message.body.track_list[0].track) {
        lyricsData.message.body.track_info = {
            track_name: searchData.message.body.track_list[0].track.track_name,
            artist_name: searchData.message.body.track_list[0].track.artist_name
        };
        lyricsData.message.body.track_list = searchData.message.body.track_list;
    }
    
    return lyricsData;
}

export async function tryGetInitialToken() {
    for (const prefix of apiPrefixes) {
        try {
            const tokenResponse = await fetch(`${prefix}/getToken`);
            if (!tokenResponse.ok) {
                throw new Error(`Initial token fetch failed for ${prefix}: ${tokenResponse.status} ${tokenResponse.statusText}`);
            }
            const tokenData = await tokenResponse.json();
            if (tokenData?.message?.header?.status_code === 200 && tokenData?.message?.body?.user_token) {
                return tokenData.message.body.user_token;
            }
        } catch (error) {
            console.error(`Error fetching initial token from ${prefix}:`, error);
        }
    }
    console.warn("Could not obtain initial token from any prefix.");
    return null;
}
