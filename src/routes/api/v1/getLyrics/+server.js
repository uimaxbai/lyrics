import { error, json } from '@sveltejs/kit';

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

    var linkToFetch = "https://api.musixmatch.com/ws/1.1/matcher.subtitle.get"
    + `?f_subtitle_length_max_deviation=1&subtitle_format=lrc`
    + `&apikey=90024f49a51caa186f9ce49a6c7af577`
    + `&track_isrc=${encodeURIComponent(name)}`;
    console.log(linkToFetch);
    // https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc

    var response = await fetch(linkToFetch, {
        headers: {
            "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157,AWSELBCORS=0',
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