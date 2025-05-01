import { error, json } from '@sveltejs/kit';

/*
if (data.message.header.status_code === 401) {
        var linkToFetchNew = `https://api.allorigins.win/get?url=${encodeURIComponent(linkToFetch)}`;
        // https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc
        var data = await response.json();
        var response = await fetch(linkToFetchNew, {
            headers: {
                "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157',
                "Origin": 'musixmatch.com',
            }
        });
        if (!response.ok) {
            error(500, "Failed to fetch data from the server.");
        }
        if (data.message.header.status_code === 401) {
            error(401, "Complete a captcha.")
        }
    }
*/

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const name = url.searchParams.get('id') || "";
    const token = url.searchParams.get('token') || "";

    if (name === "") {
        error(400, "Track ID was not specified in your request.");
    }
    if (token === "") {
        error(400, "No token was specified.");
    }

    const commonHeaders = {
        "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157', // Consider making this dynamic or configurable if needed
        "Origin": 'musixmatch.com',
    };

    const trackIdParam = `&track_id=${encodeURIComponent(name)}`;
    const tokenParam = `&usertoken=${token}`;
    const appIdParam = "?app_id=web-desktop-app-v1.0";

    const richSyncUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.richsync.get${appIdParam}${tokenParam}${trackIdParam}`;
    const subtitleUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get${appIdParam}&subtitle_format=mxm${tokenParam}${trackIdParam}`;

    try {
        // Try fetching richsync lyrics first
        let response = await fetch(richSyncUrl, { headers: commonHeaders });

        if (response.ok) {
            let data = await response.json();
            // Ensure body exists and has the expected structure
            if (data?.message?.body?.richsync?.richsync_body) {
                 // Add type indicator
                data.type = 'richsync';
                return json(data);
            } else {
                 // Richsync endpoint returned 200 but body is not as expected, treat as not found
                 console.warn(`Richsync OK but unexpected body for track ID ${name}:`, data);
                 // Fall through to fetch subtitles
            }
        } else if (response.status === 404) {
            // Richsync not found, try fetching subtitles
            console.log(`Richsync not found for track ID ${name}, falling back to subtitles.`);
            // Fall through to fetch subtitles
        } else {
            // Richsync fetch failed with an unexpected error
            
            error(response.status, `Musixmatch richsync servers errored out with status ${response.status}`);
        }

        // Fetch subtitles if richsync failed or wasn't found (404)
        response = await fetch(subtitleUrl, { headers: commonHeaders });

        if (response.ok) {
            let data = await response.json();
             // Ensure body exists and has the expected structure
            if (data?.message?.body?.subtitle?.subtitle_body) {
                // Add type indicator
                data.type = 'subtitle';
                return json(data);
            } else {
                 error(500, `Musixmatch subtitle servers returned OK but unexpected body for track ID ${name}`);
            }
        } else {
            // Subtitle fetch also failed
            error(response.status, `Musixmatch subtitle servers errored out with status ${response.status} after richsync fallback.`);
        }

    } catch (e) {
        console.error("Error fetching lyrics:", e);
        error(500, "An internal error occurred while fetching lyrics.");
    }
}

/** @type {import('./$types').RequestHandler} */
export async function fallback({ request }) {
    error(405, "Method not allowed. Use a GET request instead.");
}