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
      const repoTitle = p.repoUrl ? `<a href="${escapeHtml(p.repoUrl)}">${escapeHtml(p.repo)}</a>` : escapeHtml(p.repo);
      const details = (p.details ?? [])
        .map((d) => {
          const short = d.url ? `<a href="${escapeHtml(d.url)}">${escapeHtml(d.short || '')}</a>` : (d.short ? `<strong>(${escapeHtml(d.short)})</strong>` : '');
          return `<div class="detail">${short ? `${short} ` : ''}${escapeHtml(d.message ?? '')}</div>`;
        })
        .join('');
      return `<div class="card"><div class="title">${repoTitle}${branch}</div><div class="meta">${p.commits} commit${p.commits === 1 ? '' : 's'}</div>${details}</div>`;
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
          ${item.imageUrl ? `<div class="thumb"><img src="${escapeHtml(item.imageUrl)}" alt=""/></div>` : ''}
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
          ${play.albumImage ? `<div class="thumb"><img src="${escapeHtml(play.albumImage)}" alt=""/></div>` : ''}
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

const renderTimeline = (section) => {
  const summary = section.summary ?? {};
  const summaryParts = [`${summary.totalVisits ?? 0} visits`, `${summary.totalActivities ?? 0} activities`];
  if (summary.totalDistance) summaryParts.push(summary.totalDistance);
  if (summary.totalActivityTime) summaryParts.push(`${summary.totalActivityTime} active`);

  const activityBreakdown = (summary.activityBreakdown ?? [])
    .map((a) => `${escapeHtml(a.label)} (${a.count})`)
    .join(', ');

  const visitBreakdown = (summary.visitBreakdown ?? [])
    .map((v) => `${escapeHtml(v.label)} (${v.count})`)
    .join(', ');

  const items = (section.items ?? [])
    .slice(0, 20)
    .map(
      (item) => `
        <div class="card timeline-item">
          <div class="title">${escapeHtml(item.label || '')}${item.duration ? ` <span class="muted">· ${escapeHtml(item.duration)}</span>` : ''}${item.distance ? ` <span class="muted">· ${escapeHtml(item.distance)}</span>` : ''}</div>
          ${item.occurredAt ? `<div class="meta">${escapeHtml(new Date(item.occurredAt).toLocaleString())}</div>` : ''}
          ${item.destinations?.length ? `<div class="meta">${escapeHtml(item.destinations.join(' → '))}</div>` : ''}
        </div>
      `
    )
    .join('');

  const moreCount = (section.items?.length ?? 0) - 20;

  return `
    <h3>Timeline</h3>
    <div class="summary">${escapeHtml(summaryParts.join(' · '))}</div>
    ${activityBreakdown ? `<div class="meta">Activities: ${activityBreakdown}</div>` : ''}
    ${visitBreakdown ? `<div class="meta">Places: ${visitBreakdown}</div>` : ''}
    <div class="cards">${items || '<div class="muted">No timeline events</div>'}</div>
    ${moreCount > 0 ? `<div class="muted">...and ${moreCount} more</div>` : ''}
  `;
};

const baseStyle = `
  body { font-family: Arial, sans-serif; background: #f7f7f9; color: #1f2933; margin: 0; padding: 24px; }
  .wrapper { max-width: 640px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb; }
  h1 { margin: 0 0 8px 0; font-size: 22px; }
  h2 { margin: 4px 0 4px 0; font-size: 16px; color: #6b7280; }
  .weather-summary { margin: 0 0 16px 0; font-size: 14px; color: #6b7280; }
  h3 { margin: 16px 0 8px 0; font-size: 18px; }
  .cards { display: block; }
  .card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 10px; background: #fafafa; }
  .title { font-weight: 600; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
  .summary { margin: 8px 0; font-weight: 600; }
  .thumb { float: left; margin-right: 12px; }
  .thumb img { width: 72px; height: auto; border-radius: 4px; }
  .muted { color: #6b7280; }
  .excerpt { color: #374151; font-size: 14px; margin-top: 4px; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return iso;
  }
};

export const renderEmailBaseHtml = (vm) => {
  const sections = vm.sections
    .map((section) => {
      if (section.kind === 'github') return renderGithub(section);
      if (section.kind === 'bookmarks') return renderBookmarks(section);
      if (section.kind === 'music') return renderMusic(section);
      if (section.kind === 'timeline') return renderTimeline(section);
      return '';
    })
    .join('\n');

  const weatherHtml = vm.weather
    ? `<p class="weather-summary">${escapeHtml(vm.weather.weather_description)} · ${escapeHtml(String(vm.weather.temperature_c ?? ''))}°C</p>`
    : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${baseStyle}</style>
</head>
<body>
  <div class="wrapper">
    <h1>Daily Digest</h1>
    <h2>${escapeHtml(formatDate(vm.window.start))}</h2>
    ${weatherHtml}
    ${sections || '<div class="muted">No events in this window.</div>'}
  </div>
</body>
</html>`;
};

export const inlineEmailHtml = (html) => juice(html);

export const renderEmailHtml = (vm) => inlineEmailHtml(renderEmailBaseHtml(vm));

export default renderEmailHtml;
