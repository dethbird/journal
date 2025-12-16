import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const USER_AGENT =
  process.env.LINK_PREVIEW_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const fetchHtml = async (url) => {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.LINK_PREVIEW_TIMEOUT_MS || 10000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal,
    });

    const finalUrl = res.url || url;
    const text = await res.text();
    return { html: text, finalUrl, status: res.status };
  } finally {
    clearTimeout(timeout);
  }
};

const textContentToExcerpt = (text, max = 500) => {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.slice(0, max);
};

const extractMeta = (dom) => {
  const { document } = dom.window;
  const get = (selector) => document.querySelector(selector)?.getAttribute('content') || null;
  return {
    ogTitle: get('meta[property="og:title"]') || get('meta[name="og:title"]'),
    ogDescription: get('meta[property="og:description"]') || get('meta[name="og:description"]'),
    ogImage: get('meta[property="og:image"]') || get('meta[name="og:image"]'),
    twitterImage: get('meta[name="twitter:image"]') || get('meta[property="twitter:image"]'),
    twitterTitle: get('meta[name="twitter:title"]') || get('meta[property="twitter:title"]'),
    twitterDescription: get('meta[name="twitter:description"]') || get('meta[property="twitter:description"]'),
    siteName: get('meta[property="og:site_name"]'),
  };
};

const firstImageFromReadability = (article) => {
  if (!article?.content) return null;
  try {
    const dom = new JSDOM(article.content);
    const img = dom.window.document.querySelector('img');
    return img?.getAttribute('src') || null;
  } catch (err) {
    return null;
  }
};

const chooseImage = (meta, article) => meta.ogImage || meta.twitterImage || firstImageFromReadability(article) || null;

export const enrichLink = async (url) => {
  try {
    const { html, finalUrl, status } = await fetchHtml(url);
    const dom = new JSDOM(html, { url: finalUrl });
    const meta = extractMeta(dom);

    let article = null;
    try {
      const reader = new Readability(dom.window.document);
      article = reader.parse();
    } catch (err) {
      console.warn(`readability parse failed for ${finalUrl}: ${err?.message}`);
    }

    const title = article?.title || meta.ogTitle || meta.twitterTitle || dom.window.document.title || null;
    const excerpt = article?.excerpt || meta.ogDescription || meta.twitterDescription || textContentToExcerpt(article?.textContent);
    const image = chooseImage(meta, article);
    const textContent = article?.textContent || null;

    const byline = article?.byline || null;
    const publishedAt = article?.publishedTime || null;
    const site = meta.siteName || (new URL(finalUrl).hostname);

    const result = {
      status: 'ok',
      parser: 'readability',
      version: 1,
      url: finalUrl,
      title,
      site,
      excerpt: excerpt ? textContentToExcerpt(excerpt) : null,
      textContent,
      wordCount: textContent ? textContent.split(/\s+/).filter(Boolean).length : null,
      image,
      byline,
      publishedAt,
      httpStatus: status,
    };
    return result;
  } catch (error) {
    return {
      status: 'error',
      error: error.name === 'AbortError' ? 'timeout' : error.message,
    };
  }
};

export default enrichLink;
