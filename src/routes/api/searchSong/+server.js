import { error, json } from '@sveltejs/kit';

export async function GET({ url }) {
    const query = url.searchParams.get('q') || "";
    if (query === "") error(400, "Specify a query to search for.")
    var linkToFetch = 'https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&page_size=5&page=1&s_track_rating=desc&quorum_factor=1.0'
                      + "&usertoken=201219dbdb0f6aaba1c774bd931d0e79a28024e28db027ae72955c"
                      + `&q=${query}`;
    var response = await fetch(linkToFetch, {
        headers: {
            "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157',
            "Origin": 'musixmatch.com',
        }
    });
    var data = await response.json();
    return json(data);
}