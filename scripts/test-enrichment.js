#!/usr/bin/env node
/**
 * Test script to debug link enrichment issues
 * Usage: node scripts/test-enrichment.js <url>
 * 
 * Example: node scripts/test-enrichment.js https://boingboing.net/2025/12/19/the-new-jersey-amusement-park-so-dangerous-it-bought-the-town-extra-ambulances.html
 */

import { enrichLink } from '../src/collector/enrichers/readabilityOg.js';

const url = process.argv[2];

if (!url) {
  console.error('Usage: node scripts/test-enrichment.js <url>');
  process.exit(1);
}

console.log(`\n🔍 Testing enrichment for: ${url}\n`);

try {
  const result = await enrichLink(url);
  console.log('📊 Enrichment Result:');
  console.log(JSON.stringify(result, null, 2));
  
  console.log('\n📋 Summary:');
  console.log(`  Status: ${result.status}`);
  console.log(`  HTTP Status: ${result.httpStatus}`);
  console.log(`  Title: ${result.title || '(none)'}`);
  console.log(`  Image: ${result.image || '(none)'}`);
  console.log(`  Excerpt: ${result.excerpt ? result.excerpt.substring(0, 100) + '...' : '(none)'}`);
  
  if (result.httpStatus >= 400) {
    console.log('\n⚠️  HTTP error detected. This site may be blocking scrapers.');
    console.log('   Consider using email subject as fallback title.');
  }
  
  if (!result.image) {
    console.log('\n⚠️  No image found. Open Graph tags may be missing or protected.');
  }
  
} catch (error) {
  console.error('❌ Enrichment failed:', error.message);
  console.error(error);
  process.exit(1);
}
