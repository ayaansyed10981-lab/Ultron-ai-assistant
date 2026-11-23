import https from 'node:https';
import { logger } from './logger.js';
import { normalizeSpokenTranscript } from './audio.js';

/**
 * Fast streaming resolver for the #1 matching YouTube video.
 * Streams the YouTube search page HTML and aborts the request as soon as the
 * first videoId is spotted (typically within 30-80 KB), resolving in < 300ms.
 */
export function resolveDirectYouTubeVideo(query, timeoutMs = 2800) {
  return new Promise((resolve) => {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) {
      return resolve({
        ok: false,
        url: 'https://www.youtube.com',
        title: '',
        error: 'Empty query',
      });
    }

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logger.warn(`[MUSIC] YouTube direct video lookup timed out (> ${timeoutMs}ms) for "${cleanQuery}". Using direct watch redirect fallback.`);
        // Fallback: Google I'm Feeling Lucky direct redirect to YouTube watch
        const luckyUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery + ' site:youtube.com/watch')}&btnI=1`;
        resolve({
          ok: false,
          fallbackUrl: luckyUrl,
          url: luckyUrl,
          title: cleanQuery,
          method: 'lucky_fallback',
        });
      }
    }, timeoutMs);

    try {
      const req = https.get(
        searchUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          let buffer = '';

          res.on('data', (chunk) => {
            if (resolved) return;
            buffer += chunk.toString('utf8');

            // Find first videoId in ytInitialData or HTML
            const idMatch = buffer.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (idMatch) {
              const videoId = idMatch[1];
              let title = cleanQuery;
              const titleMatch = buffer.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
              if (titleMatch && titleMatch[1]) {
                title = titleMatch[1];
              }

              resolved = true;
              clearTimeout(timer);
              try {
                req.destroy();
              } catch {}

              const directWatchUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
              logger.info(`[MUSIC] Resolved direct YouTube video: "${title}" [ID: ${videoId}]`);
              return resolve({
                ok: true,
                videoId,
                title,
                url: directWatchUrl,
                method: 'direct_stream',
              });
            }
          });

          res.on('end', () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);

            // Secondary check if videoId wasn't found in early chunks
            const secondMatch =
              buffer.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/) ||
              buffer.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);

            if (secondMatch) {
              const videoId = secondMatch[1];
              return resolve({
                ok: true,
                videoId,
                title: cleanQuery,
                url: `https://www.youtube.com/watch?v=${videoId}&autoplay=1`,
                method: 'end_scan',
              });
            }

            // Fallback: Google Feeling Lucky direct watch redirect
            const luckyUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery + ' site:youtube.com/watch')}&btnI=1`;
            return resolve({
              ok: false,
              fallbackUrl: luckyUrl,
              url: luckyUrl,
              title: cleanQuery,
              method: 'lucky_fallback',
            });
          });
        },
      );

      req.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        logger.warn(`[MUSIC] YouTube search fetch error: ${err.message}. Using direct search fallback.`);
        const luckyUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery + ' site:youtube.com/watch')}&btnI=1`;
        resolve({
          ok: false,
          fallbackUrl: luckyUrl,
          url: luckyUrl,
          title: cleanQuery,
          method: 'lucky_fallback',
        });
      });
    } catch (err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const luckyUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery + ' site:youtube.com/watch')}&btnI=1`;
      resolve({
        ok: false,
        fallbackUrl: luckyUrl,
        url: luckyUrl,
        title: cleanQuery,
        method: 'lucky_fallback',
      });
    }
  });
}

/**
 * Execute direct playback of a requested song or music query.
 * Opens the specific video directly on YouTube (or Spotify) with autoplay enabled.
 */
export async function playSongDirectly(rawQuery, controller, platform = 'youtube') {
  let query = normalizeSpokenTranscript(String(rawQuery || '').trim());

  // Clean trailing filler phrases
  query = query
    .replace(/\s+on\s+spotify$/i, '')
    .replace(/\s+on\s+(?:youtube|yt)$/i, '')
    .trim();

  if (!query) {
    return { ok: false, message: 'What song would you like to hear, sir?' };
  }

  logger.info(`[MUSIC] Initiating direct playback for: "${query}" (Platform: ${platform})`);

  if (platform === 'spotify') {
    // Spotify desktop protocol fallback to web search
    const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    await controller.executeTool('open_url', { url: spotifyUrl });
    return {
      ok: true,
      url: spotifyUrl,
      title: query,
      reply: `Playing ${query} on Spotify for you, sir.`,
    };
  }

  // YouTube Direct Video Playback
  const res = await resolveDirectYouTubeVideo(query);
  const targetUrl = res.url;
  const songTitle = res.title || query;

  await controller.executeTool('open_url', { url: targetUrl });

  return {
    ok: true,
    url: targetUrl,
    title: songTitle,
    videoId: res.videoId || null,
    reply: `Playing ${songTitle} directly for you, sir.`,
  };
}
