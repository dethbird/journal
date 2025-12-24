const formatLine = (title) => `== ${title} ==`;

const renderGithub = (section) => {
  const lines = [formatLine('GitHub')];

  for (const push of section.pushes ?? []) {
    const branchPart = push.branch ? ` (${push.branch})` : '';
    lines.push(`• ${push.repo}${branchPart}: ${push.commits} commits`);
    for (const detail of push.details ?? []) {
      lines.push(`  – ${detail.short ? `(${detail.short}) ` : ''}${detail.message ?? ''}`.trim());
    }
  }

  if ((section.prs ?? []).length) {
    lines.push('Pull requests:');
    for (const pr of section.prs) {
      lines.push(`• ${pr.repo}: ${pr.label} ${pr.action}`);
    }
  }

  const summary = section.summary ?? {};
  lines.push(
    `Summary: ${summary.commits ?? 0} commit(s) · ${summary.repoCount ?? 0} repo(s) · ${summary.prCount ?? 0} PR(s)`
  );

  return lines;
};

const renderBookmarks = (section) => {
  const lines = [formatLine('Bookmarks')];
  for (const item of section.items ?? []) {
    lines.push(`• ${item.title} — ${item.url}`);
    if (item.excerpt) {
      lines.push(`  ${item.excerpt}`);
    }
  }
  return lines;
};

const renderMusic = (section) => {
  const lines = [formatLine('Spotify')];
  const summary = section.summary ?? {};
  const summaryParts = [`${summary.playCount ?? 0} plays`, `${summary.uniqueTracks ?? 0} tracks`];
  if (summary.durationLabel) summaryParts.push(summary.durationLabel);
  lines.push(`• ${summaryParts.join(' · ')}`);

  if ((summary.topGenres ?? []).length) {
    lines.push(`• Top genres: ${summary.topGenres.map((g) => `${g.name} (${g.percent}%)`).join(', ')}`);
  }
  if ((summary.topArtists ?? []).length) {
    lines.push(`• Top artists: ${summary.topArtists.map((a) => `${a.name} (${a.count})`).join(', ')}`);
  }
  if ((summary.topTracks ?? []).length) {
    lines.push(`• Most played: ${summary.topTracks.map((t) => `${t.name} (${t.count})`).join(', ')}`);
  }

  return lines;
};

const renderGaming = (section) => {
  const lines = [formatLine('Steam')];
  const summary = section.summary ?? {};
  
  // Summary line
  const summaryParts = [];
  if (summary.gamesPlayed) summaryParts.push(`${summary.gamesPlayed} games`);
  if (summary.totalDurationLabel) summaryParts.push(summary.totalDurationLabel);
  if (summary.achievementsUnlocked) summaryParts.push(`${summary.achievementsUnlocked} achievements`);
  if (summaryParts.length) {
    lines.push(`• ${summaryParts.join(' · ')}`);
  }

  // Top games by playtime
  if ((section.topGames ?? []).length) {
    lines.push('Games played:');
    for (const game of section.topGames) {
      lines.push(`  • ${game.name}: ${game.durationLabel || `${game.minutes}m`}`);
    }
  }

  // Recent achievements
  if ((section.achievements ?? []).length) {
    lines.push('Achievements unlocked:');
    for (const achievement of section.achievements) {
      lines.push(`  🏆 ${achievement.achievementName} (${achievement.gameName})`);
    }
  }

  return lines;
};

export const renderTextDigest = (vm) => {
  const lines = [];
  lines.push('Daily Digest');
  lines.push(`Window: ${vm.window.start} -> ${vm.window.end}`);

  if (!vm.sections?.length) {
    lines.push('No events in this window.');
    return lines.join('\n');
  }

  for (const section of vm.sections) {
    lines.push('');
    if (section.kind === 'github') {
      lines.push(...renderGithub(section));
    } else if (section.kind === 'bookmarks') {
      lines.push(...renderBookmarks(section));
    } else if (section.kind === 'music') {
      lines.push(...renderMusic(section));
    } else if (section.kind === 'gaming') {
      lines.push(...renderGaming(section));
    }
  }

  return lines.join('\n');
};

export default renderTextDigest;
