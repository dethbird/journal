import juice from 'juice';

const escapeHtml = (str) =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderGithub = (section) => {
  const pushes = (section.pushes ?? [])
    .map((p) => {
      const branch = p.branch ? ` <span class="muted">(${escapeHtml(p.branch)})</span>` : '';
      const details = (p.details ?? [])
        .map((d) => `<div class="detail">${d.short ? `<strong>(${escapeHtml(d.short)})</strong> ` : ''}${escapeHtml(d.message ?? '')}</div>`)
        .join('');
      return `<div class="card"><div class="title">${escapeHtml(p.repo)}${branch}</div><div class="meta">${p.commits} commit${p.commits === 1 ? '' : 's'}</div>${details}</div>`;
    })
    .join('');

  const prs = (section.prs ?? [])
    .map((pr) => `<div class="card"><div class="title">${escapeHtml(pr.repo)}</div><div class="meta">${escapeHtml(pr.label)} ${escapeHtml(pr.action)}</div></div>`)
    .join('');

  const summary = section.summary ?? {};
  const summaryLine = `${summary.commits ?? 0} commit${summary.commits === 1 ? '' : 's'} · ${summary.repoCount ?? 0} repo${summary.repoCount === 1 ? '' : 's'} · ${summary.prCount ?? 0} PR${summary.prCount === 1 ? '' : 's'}`;

  return `
    <h3>GitHub</h3>
    <div class="cards">${pushes || '<div class="muted">No pushes</div>'}</div>
    ${prs ? `<div class="cards">${prs}</div>` : ''}
    <div class="summary">${escapeHtml(summaryLine)}</div>
  `;
};

const renderBookmarks = (section) => {
  const items = (section.items ?? [])
    .map(
      (item) => `
        <div class="card bookmark">
          <div class="title"><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></div>
          ${item.excerpt ? `<div class="excerpt">${escapeHtml(item.excerpt)}</div>` : ''}
        </div>
      `
    )
    .join('');

  return `
    <h3>Bookmarks (${section.count ?? 0})</h3>
    <div class="cards">${items || '<div class="muted">No bookmarks</div>'}</div>
  `;
};

const renderMusic = (section) => {
  const summary = section.summary ?? {};
  const summaryParts = [`${summary.playCount ?? 0} plays`, `${summary.uniqueTracks ?? 0} tracks`];
  if (summary.durationLabel) summaryParts.push(summary.durationLabel);

  const plays = (section.plays ?? [])
    .map(
      (play) => `
        <div class="card play">
          <div class="title">${escapeHtml(play.trackName)}${play.artists?.length ? ` <span class="muted">by ${escapeHtml(play.artists.join(', '))}</span>` : ''}</div>
          ${play.playedAt ? `<div class="meta">${escapeHtml(play.playedAt)}</div>` : ''}
        </div>
      `
    )
    .join('');

  const topArtists = (summary.topArtists ?? []).map((a) => `${escapeHtml(a.name)} (${a.count})`).join(', ');
  const topTracks = (summary.topTracks ?? []).map((t) => `${escapeHtml(t.name)} (${t.count})`).join(', ');

  return `
    <h3>Spotify</h3>
    <div class="summary">${escapeHtml(summaryParts.join(' · '))}</div>
    ${topArtists ? `<div class="meta">Top artists: ${topArtists}</div>` : ''}
    ${topTracks ? `<div class="meta">Most played: ${topTracks}</div>` : ''}
    <div class="cards">${plays || '<div class="muted">No recent plays</div>'}</div>
  `;
};

const baseStyle = `
  body { font-family: Arial, sans-serif; background: #f7f7f9; color: #1f2933; margin: 0; padding: 24px; }
  .wrapper { max-width: 640px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb; }
  h1 { margin: 0 0 8px 0; font-size: 22px; }
  h2 { margin: 4px 0 16px 0; font-size: 16px; color: #6b7280; }
  h3 { margin: 16px 0 8px 0; font-size: 18px; }
  .cards { display: block; }
  .card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 10px; background: #fafafa; }
  .title { font-weight: 600; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
  .summary { margin: 8px 0; font-weight: 600; }
  .muted { color: #6b7280; }
  .excerpt { color: #374151; font-size: 14px; margin-top: 4px; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

export const renderEmailBaseHtml = (vm) => {
  const sections = vm.sections
    .map((section) => {
      if (section.kind === 'github') return renderGithub(section);
      if (section.kind === 'bookmarks') return renderBookmarks(section);
      if (section.kind === 'music') return renderMusic(section);
      return '';
    })
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${baseStyle}</style>
</head>
<body>
  <div class="wrapper">
    <h1>Daily Digest</h1>
    <h2>${escapeHtml(vm.window.start)} → ${escapeHtml(vm.window.end)}</h2>
    ${sections || '<div class="muted">No events in this window.</div>'}
  </div>
</body>
</html>`;
};

export const inlineEmailHtml = (html) => juice(html);

export const renderEmailHtml = (vm) => inlineEmailHtml(renderEmailBaseHtml(vm));

export default renderEmailHtml;
