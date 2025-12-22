#!/usr/bin/env node
/**
 * Re-enrich an existing bookmark event with email subject fallback
 * Usage: node scripts/re-enrich-event.js <eventId>
 * 
 * Example: node scripts/re-enrich-event.js cmjhdj11m002xlbw23kvlypqe
 */

import prisma from '../src/lib/prismaClient.js';
import { enrichLink } from '../src/collector/enrichers/readabilityOg.js';

const eventId = process.argv[2];

if (!eventId) {
  console.error('Usage: node scripts/re-enrich-event.js <eventId>');
  process.exit(1);
}

async function main() {
  await prisma.$connect();
  
  console.log(`\n🔍 Looking up event: ${eventId}`);
  
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { enrichments: true },
  });
  
  if (!event) {
    console.error(`❌ Event not found: ${eventId}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  
  console.log('\n📧 Event payload:');
  console.log(JSON.stringify(event.payload, null, 2));
  
  console.log('\n🔖 Current enrichments:');
  event.enrichments.forEach((e) => {
    console.log(`  - ${e.enrichmentType}:`);
    console.log(JSON.stringify(e.data, null, 2));
  });
  
  // Extract link from event
  const payload = event.payload;
  const links = payload?.links;
  const firstLink = Array.isArray(links) && links.length > 0 ? links[0]?.url || links[0] : null;
  
  if (!firstLink) {
    console.error('\n❌ No link found in event payload');
    await prisma.$disconnect();
    process.exit(1);
  }
  
  console.log(`\n🌐 Re-enriching URL: ${firstLink}`);
  
  try {
    const preview = await enrichLink(firstLink);
    
    console.log('\n📊 New enrichment result:');
    console.log(JSON.stringify(preview, null, 2));
    
    // Apply email subject fallback if needed
    if (preview.status === 'ok' && preview.httpStatus && preview.httpStatus >= 400) {
      const emailSubject = payload?.subject;
      if (emailSubject && (!preview.title || preview.title === 'Just a moment...' || preview.title.includes('Access denied'))) {
        console.log(`\n✨ Applying email subject fallback: "${emailSubject}"`);
        preview.title = emailSubject;
        preview.titleSource = 'email_subject_fallback';
      }
    }
    
    // Update enrichment in database
    const existing = event.enrichments.find((e) => e.enrichmentType === 'readability_v1');
    
    if (existing) {
      console.log('\n💾 Updating existing enrichment...');
      await prisma.eventEnrichment.update({
        where: { id: existing.id },
        data: {
          data: preview,
          fetchedAt: new Date(),
        },
      });
    } else {
      console.log('\n💾 Creating new enrichment...');
      await prisma.eventEnrichment.create({
        data: {
          eventId: event.id,
          source: event.source,
          enrichmentType: 'readability_v1',
          data: preview,
        },
      });
    }
    
    console.log('✅ Enrichment updated successfully!');
    
    // Show final result
    const updated = await prisma.event.findUnique({
      where: { id: eventId },
      include: { enrichments: true },
    });
    
    console.log('\n📋 Updated enrichments:');
    updated.enrichments.forEach((e) => {
      console.log(`  - ${e.enrichmentType}:`);
      console.log(JSON.stringify(e.data, null, 2));
    });
    
  } catch (error) {
    console.error('\n❌ Enrichment failed:', error.message);
    
    // Store error with email subject fallback
    const emailSubject = payload?.subject;
    const errorData = {
      status: 'error',
      error: error.message,
      title: emailSubject || null,
      titleSource: emailSubject ? 'email_subject_fallback' : null,
    };
    
    const existing = event.enrichments.find((e) => e.enrichmentType === 'readability_v1');
    
    if (existing) {
      await prisma.eventEnrichment.update({
        where: { id: existing.id },
        data: {
          data: errorData,
          fetchedAt: new Date(),
        },
      });
    } else {
      await prisma.eventEnrichment.create({
        data: {
          eventId: event.id,
          source: event.source,
          enrichmentType: 'readability_v1',
          data: errorData,
        },
      });
    }
    
    console.log('💾 Stored error with email subject fallback');
  }
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
