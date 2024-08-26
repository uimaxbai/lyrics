# lyrics

### Changes that I make in this version

- Use Spotify search instead of Musixmatch
- Try to fix broken lyrics (see main branch)

Get lyrics from Musixmatch and display them on a website.

*[Try it out](https://livelyrics.pages.dev)*

## Run it locally

1. Install packages `npm i`
2. Run the dev server `npm run dev`
3. Try it out!

## API specification

- GET `/api/v1/searchSong`

  Returns a JSON list of songs based on the search query. Factors in artists and lyrics as well as song names.

  Query parameters:

  `q` Your search query

  `token` Your Musixmatch 
  token which can be generated via `getToken`

- GET `/api/v1/getToken`
  
  Returns a token for use with the API in JSON format.

- GET `/api/v1/getLyrics`

  Returns a set of line-by-line lyrics in JSON format.

  Query parameters:

  `id` The track ID of the song, fetched via `searchSong`

  `token` Your Musixmatch token which can be generated via `getToken`

## Todo

- [x] Auto-scroll lyrics
~~- [ ] Soundcloud to play the songs~~ *SoundCloud APIs are currently closed*
- [x] Less aggressive auto-scroll
- [x] Fix auto-scroll bugs
- [ ] Add desktop support