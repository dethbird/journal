/**
 * Media embedding utilities for journal entries
 * Detects video and image URLs and converts them to HTML embeds
 */

/**
 * Extract YouTube video ID from various URL formats
 */
const extractYouTubeId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/\s]+)/i,
    /youtube\.com\/embed\/([^&?/\s]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

/**
 * Extract Vimeo video ID from URL
 */
const extractVimeoId = (url) => {
  const match = url.match(/vimeo\.com\/(\d+)/i);
  return match ? match[1] : null;
};

/**
 * Check if URL is a direct video file
 */
const isDirectVideoUrl = (url) => {
  const videoExtensions = /\.(mp4|webm|ogg|mov|avi)(\?.*)?$/i;
  return videoExtensions.test(url);
};

/**
 * Check if URL is a direct image file
 */
const isDirectImageUrl = (url) => {
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
  return imageExtensions.test(url);
};

/**
 * Check if URL is a YouTube URL
 */
const isYouTubeUrl = (url) => {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
};

/**
 * Check if URL is a Vimeo URL
 */
const isVimeoUrl = (url) => {
  return /vimeo\.com/i.test(url);
};

/**
 * Generate HTML5 video embed for direct video URLs
 */
const generateVideoEmbed = (url) => {
  return `<video controls class="journal-video-embed">
  <source src="${url}" type="video/mp4">
  Your browser does not support the video tag.
</video>`;
};

/**
 * Generate image embed for direct image URLs
 */
const generateImageEmbed = (url) => {
  return `<img src="${url}" alt="" class="journal-image-embed" />`;
};

/**
 * Generate YouTube embed iframe
 */
const generateYouTubeEmbed = (videoId) => {
  return `<iframe class="journal-video-embed" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
};

/**
 * Generate Vimeo embed iframe
 */
const generateVimeoEmbed = (videoId) => {
  return `<iframe class="journal-video-embed" src="https://player.vimeo.com/video/${videoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
};

/**
 * Process content and convert video and image URLs to embeds
 * @param {string} content - Raw markdown content
 * @returns {string} - Content with media URLs converted to embeds
 */
export const processMediaEmbeds = (content) => {
  if (!content) return content;

  // Check if content already has video/iframe/img tags (already embedded)
  if (/<video|<iframe|<img/i.test(content)) {
    return content; // Don't process if already has embeds
  }

  // Find all URLs in the content — also match spaces within URLs (e.g. filenames with spaces)
  const urlPattern = /(https?:\/\/[^\s<>"]*(?:[ \t][^\s<>"]+)*)/gi;
  
  return content.replace(urlPattern, (rawUrl, _p1, offset) => {
    // Percent-encode any spaces or tabs in the URL
    const url = rawUrl.replace(/[ \t]/g, (m) => m === '\t' ? '%09' : '%20');

    // Check if this URL is part of a markdown link/image [text](url) or ![alt](url)
    // If so, don't convert it to embed
    const beforeUrl = content.substring(0, offset);
    if (/!?\[[^\]]*\]\($/.test(beforeUrl.slice(-50))) {
      return rawUrl; // It's part of a markdown link/image, leave it
    }

    // Check if URL is already in an HTML tag
    const contextBefore = beforeUrl.slice(-20);
    if (/<[^>]*$/.test(contextBefore)) {
      return rawUrl; // Already in an HTML tag
    }

    // Direct image file
    if (isDirectImageUrl(url)) {
      return generateImageEmbed(url);
    }

    // Direct video file
    if (isDirectVideoUrl(url)) {
      return generateVideoEmbed(url);
    }

    // YouTube
    if (isYouTubeUrl(url)) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        return generateYouTubeEmbed(videoId);
      }
    }

    // Vimeo
    if (isVimeoUrl(url)) {
      const videoId = extractVimeoId(url);
      if (videoId) {
        return generateVimeoEmbed(videoId);
      }
    }

    // Not a media URL, return as-is (return rawUrl to preserve original spacing)
    return rawUrl;
  });
};

export default processMediaEmbeds;
