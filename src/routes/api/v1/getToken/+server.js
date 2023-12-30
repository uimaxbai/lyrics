/*
function getToken(): void
    {
        
        $result = $this->get($this->token_url);
        
        // You can choose to store the result in a variable or use it directly.
        
        if (!$result) {
        throw new \Exception('Failed to retrieve the access token.');
        }

        $token_json = json_decode($result, true);
        if (!$token_json['message']['header']['status_code'] == 200) {
            throw new \Exception($result);
         }

        // Save the token to a cache file
        $current_time = time();
        
        $new_token = $token_json["message"]["body"]["user_token"];
        $expiration_time = $current_time + 600;
        $token_data = ["user_token" => $new_token, "expiration_time" => $expiration_time];
        
        $tokenFile = 'musix.txt';
        file_put_contents($tokenFile, json_encode($token_data));
     }
*/

import { error, json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	// const name = url.searchParams.get('id') || "";

    var linkToFetch = "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0";
    // https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc

    var response = await fetch(linkToFetch, {
        headers: {
            "Cookie": 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157',
            "Origin": 'musixmatch.com',
        }
    });
    var data = await response.json();
    if (data.message.header.status_code === 401) {
        error(401, "Complete a captcha.")
    }
    // data = data.message.body;

    // return new Response(String(data));
    return json(data);
}

/** @type {import('./$types').RequestHandler} */
export async function fallback({ request }) {
    error(405, "Method not allowed. Use a GET request instead.");
}