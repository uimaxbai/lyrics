import { error, json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	const name = url.searchParams.get('id') || "";

    if (name === "") {
        error(400, "Track ID was not specified in your request.");
    }

    var linkToFetch = "https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0"
    + "&subtitle_format=mxm"
    + "&usertoken=201219dbdb0f6aaba1c774bd931d0e79a28024e28db027ae72955c" // yes I am exposing (not my) token, have at it
    + `&track_id=${encodeURIComponent(name)}`;
    // https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc

    var response = await fetch(linkToFetch, {
        headers: {
            "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157',
            "Origin": 'musixmatch.com',
        }
    });
    if (!response.ok) {
        error(500, `Musixmatch servers errored out with error ${response.status}`);
    }
    var data = await response.json();

    return json(data);
}

/** @type {import('./$types').RequestHandler} */
export async function fallback({ request }) {
    error(405, "Method not allowed. Use a GET request instead.");
}