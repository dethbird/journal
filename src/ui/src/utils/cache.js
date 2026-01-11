/**
 * Clear all digest cache entries from localStorage
 * @returns {number} Number of cache entries cleared
 */
export function clearDigestCache() {
  let clearedCount = 0;
  const keysToRemove = [];
  
  // Collect all digest-* keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('digest-')) {
      keysToRemove.push(key);
    }
  }
  
  // Remove all collected keys
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    clearedCount++;
  });
  
  return clearedCount;
}
