import { error, json } from '@sveltejs/kit';

export async function GET({ url }) {
    const query = url.searchParams.get('q') || "";
    const isrc = url.searchParams.get('isrc') || "";
    const token = url.searchParams.get('token') || "";
    const page = parseInt(url.searchParams.get('page')) || 1;
    
    if (token === "") error(400, "Please specify your user token.");
    if (query === "" && isrc === "") error(400, "Specify a query (q) or ISRC (isrc) to search for.");

    const commonHeaders = {
        "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157',
        "Origin": 'musixmatch.com',
    };

    let linkToFetch;
    
    if (isrc) {
        // Use track.get for ISRC lookup
        linkToFetch = `https://apic-desktop.musixmatch.com/ws/1.1/track.get?app_id=web-desktop-app-v1.0&usertoken=${token}&track_isrc=${encodeURIComponent(isrc)}`;
    } else {
        // Use track.search for text-based queries
        linkToFetch = `https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&page_size=5&f_has_lyrics=true&usertoken=${token}&page=${page}&q=${encodeURIComponent(query)}`;
    }
    
    var response = await fetch(linkToFetch, { headers: commonHeaders });
    var data = await response.json();

    if (data.message.header.status_code === 401) {
        error(401, "Complete a captcha.")
    }

    // If it's an ISRC lookup, transform the response to match the expected track_list format
    if (isrc && data.message.body.track) {
        const track = data.message.body.track;
        // Transform single track response to match track_list format expected by frontend
        data.message.body.track_list = [{
            track: {
                track_id: track.track_id,
                track_name: track.track_name,
                artist_name: track.artist_name,
                album_coverart_100x100: track.album_coverart_100x100 || "http://s.mxmcdn.net/images-storage/albums/nocover.png"
            }
        }];
    }
    
    return json(data);
}