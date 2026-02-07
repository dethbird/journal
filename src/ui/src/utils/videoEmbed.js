/**
 * Video embedding utilities for journal entries
 * Detects video URLs and converts them to HTML embeds
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
  return `<video controls class="journal-video-embed" style="max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0;">
  <source src="${url}" type="video/mp4">
  Your browser does not support the video tag.
</video>`;
};

/**
 * Generate YouTube embed iframe
 */
const generateYouTubeEmbed = (videoId) => {
  return `<iframe class="journal-video-embed" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width: 100%; max-width: 560px; height: 315px; border-radius: 6px; margin: 12px 0;"></iframe>`;
};

/**
 * Generate Vimeo embed iframe
 */
const generateVimeoEmbed = (videoId) => {
  return `<iframe class="journal-video-embed" src="https://player.vimeo.com/video/${videoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width: 100%; max-width: 560px; height: 315px; border-radius: 6px; margin: 12px 0;"></iframe>`;
};

/**
 * Process content and convert video URLs to embeds
 * @param {string} content - Raw markdown content
 * @returns {string} - Content with video URLs converted to embeds
 */
export const processVideoEmbeds = (content) => {
  if (!content) return content;

  // Check if content already has video/iframe tags (already embedded)
  if (/<video|<iframe/i.test(content)) {
    return content; // Don't process if already has embeds
  }

  // Find all URLs in the content
  const urlPattern = /(https?:\/\/[^\s<>"]+)/gi;
  
  return content.replace(urlPattern, (url) => {
    // Check if this URL is part of a markdown link [text](url)
    // If so, don't convert it to embed
    const beforeUrl = content.substring(0, content.indexOf(url));
    if (/\[[^\]]*\]\($/.test(beforeUrl.slice(-50))) {
      return url; // It's part of a markdown link, leave it
    }

    // Check if URL is already in an HTML tag
    const contextBefore = beforeUrl.slice(-20);
    if (/<[^>]*$/.test(contextBefore)) {
      return url; // Already in an HTML tag
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

    // Not a video URL, return as-is
    return url;
  });
};

export default processVideoEmbeds;
