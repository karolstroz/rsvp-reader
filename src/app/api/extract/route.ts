/**
 * Article extraction endpoint.
 *
 * Fetches a URL server-side and runs Mozilla Readability — the same algorithm
 * behind Firefox Reader View — over a jsdom document to strip navigation,
 * adverts and boilerplate, leaving the article body.
 *
 * Server-side is not optional here: the browser cannot fetch arbitrary origins
 * because of CORS, and jsdom is a Node-only dependency.
 */

import { NextResponse } from 'next/server';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability, isProbablyReaderable } from '@mozilla/readability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cap the download so a stray link to a huge file cannot exhaust memory. */
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; RSVPReader/0.1; +https://github.com/karolstroz/docs)';

/**
 * Reject anything that is not a public http(s) URL.
 *
 * Without this the endpoint is an SSRF primitive: a client could ask the server
 * to fetch `http://169.254.169.254/` or an address on the private network and
 * read back the response body.
 */
function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That does not look like a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^fe80:/i.test(host);

  if (blocked) throw new Error('Requests to private or local addresses are not allowed.');

  return url;
}

/** Collapse Readability's HTML output into paragraph-separated plain text. */
function htmlToText(dom: JSDOM, html: string): string {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('script, style, noscript, figure, figcaption').forEach((node) => {
    node.remove();
  });

  const blocks = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
  const source = blocks.length > 0 ? Array.from(blocks) : [container];

  return source
    .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function POST(request: Request) {
  let target: URL;

  try {
    const body = (await request.json()) as { url?: string };
    if (!body?.url || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'Provide a `url` to extract.' }, { status: 400 });
    }
    target = assertPublicUrl(body.url.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let html: string;
  let finalUrl = target.toString();

  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `The site responded with ${response.status} ${response.statusText}.` },
        { status: 502 },
      );
    }

    // A redirect can land somewhere private even when the original URL was not.
    finalUrl = response.url || finalUrl;
    assertPublicUrl(finalUrl);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      return NextResponse.json(
        { error: `Expected an HTML page but the URL returned ${contentType.split(';')[0]}.` },
        { status: 415 },
      );
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'That page is too large to extract.' }, { status: 413 });
    }

    html = new TextDecoder('utf-8').decode(buffer);
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The site took too long to respond.'
        : 'Could not reach that URL.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    // jsdom logs every CSS parse error on a real-world page; silence it.
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => {});

    const dom = new JSDOM(html, { url: finalUrl, virtualConsole });
    const document = dom.window.document;

    const fallbackTitle = document.title?.trim() || new URL(finalUrl).hostname;

    if (!isProbablyReaderable(document)) {
      // Not article-shaped (a homepage, a listing). Fall back to the body text
      // rather than failing outright — short pages still read fine.
      const text = htmlToText(dom, document.body?.innerHTML ?? '');
      dom.window.close();

      if (!text.trim()) {
        return NextResponse.json(
          { error: 'No readable article text found on that page.' },
          { status: 422 },
        );
      }

      return NextResponse.json({ title: fallbackTitle, text, url: finalUrl });
    }

    const article = new Readability(document).parse();
    const text = article?.content ? htmlToText(dom, article.content) : '';
    const title = article?.title?.trim() || fallbackTitle;
    const byline = article?.byline?.trim() || article?.siteName?.trim() || undefined;

    dom.window.close();

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'No readable article text found on that page.' },
        { status: 422 },
      );
    }

    return NextResponse.json({ title, byline, text, url: finalUrl });
  } catch {
    return NextResponse.json({ error: 'Failed to parse that page.' }, { status: 500 });
  }
}
