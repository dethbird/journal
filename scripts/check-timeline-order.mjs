import prisma from '../src/lib/prismaClient.js';

const fetchDriveFile = async (fileId, token) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive error ${res.status}`);
  return res.json();
};

const main = async () => {
  const acc = await prisma.connectedAccount.findFirst({
    where: { provider: 'google', googleTimelineSettings: { driveFileId: { not: null } } },
    include: { oauthTokens: true, googleTimelineSettings: true },
  });
  
  const token = acc.oauthTokens.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0].accessToken;
  const data = await fetchDriveFile(acc.googleTimelineSettings.driveFileId, token);
  const segs = data.semanticSegments;
  
  console.log('First 5 segments:');
  segs.slice(0, 5).forEach((s, i) => console.log(`  ${i}: ${s.startTime}`));
  
  console.log('\nLast 5 segments:');
  segs.slice(-5).forEach((s, i) => console.log(`  ${segs.length - 5 + i}: ${s.startTime}`));
  
  console.log(`\nCursor: 2025-12-17T22:05:47.000Z`);
  console.log(`\nSegments after cursor:`);
  const afterCursor = segs.filter(s => new Date(s.startTime) > new Date('2025-12-17T22:05:47.000Z'));
  console.log(`  Count: ${afterCursor.length}`);
  if (afterCursor.length > 0) {
    afterCursor.slice(0, 5).forEach(s => console.log(`    ${s.startTime}`));
  }
  
  await prisma.$disconnect();
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
