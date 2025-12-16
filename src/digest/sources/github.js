import { registerDigest } from '../registry.js';

const DIVIDER = '────────────────────';

const getEnrichment = (event, type) =>
  event.enrichments?.find((en) => en.enrichmentType === type)?.data ?? null;

const repoFallback = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  return (
    payload.repo?.name ??
    payload.repo?.full_name ??
    raw.repo?.full_name ??
    raw.repo?.name ??
    null
  );
};

const parseBranch = (rawRef, fallbackBranch) => {
  if (fallbackBranch) return fallbackBranch;
  if (typeof rawRef === 'string' && rawRef.startsWith('refs/heads/')) {
    return rawRef.slice('refs/heads/'.length);
  }
  return rawRef ?? null;
};

const buildCodeSection = (events) => {
  const pushes = events.filter((evt) => evt.eventType === 'PushEvent');
  const groups = new Map();

  for (const evt of pushes) {
    const enrichment = getEnrichment(evt, 'github_push_v1');
    const payload = evt.payload ?? {};
    const raw = payload.raw ?? {};

    const repo = enrichment?.repo ?? repoFallback(evt) ?? 'Unknown repo';
    const branch = enrichment?.branch ?? parseBranch(raw.ref, payload.branch);

    const commitCount = enrichment?.commit_count ?? raw.size ?? raw.commits?.length ?? 1;
    const subjects = Array.isArray(enrichment?.commit_subjects)
      ? enrichment.commit_subjects.filter(Boolean).slice(0, 2)
      : [];

    const key = `${repo}::${branch ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, { repo, branch, commits: 0, subjects: [] });
    }

    const entry = groups.get(key);
    entry.commits += commitCount || 1;
    if (entry.subjects.length < 2) {
      entry.subjects = [...entry.subjects, ...subjects].slice(0, 2);
    }
  }

  const lines = [];
  const stats = { commits: 0, repos: new Set() };

  if (groups.size === 0) {
    return { lines, stats };
  }

  lines.push('Code');

  const sorted = [...groups.values()].sort((a, b) => b.commits - a.commits || a.repo.localeCompare(b.repo));
  for (const group of sorted) {
    stats.commits += group.commits;
    if (group.repo) {
      stats.repos.add(group.repo);
    }

    const branchPart = group.branch ? ` (${group.branch})` : '';
    lines.push(`• ${group.repo}${branchPart}: ${group.commits} commits`);
    for (const subject of group.subjects) {
      lines.push(`  – ${subject}`);
    }
  }

  return { lines, stats };
};

const buildPullRequestsSection = (events) => {
  const prs = events.filter((evt) => evt.eventType === 'PullRequestEvent');
  const deduped = new Map();

  for (const evt of prs) {
    const enrichment = getEnrichment(evt, 'github_pr_v1');
    const payload = evt.payload ?? {};
    const raw = payload.raw ?? {};
    const pr = raw.pull_request ?? {};

    const repo = enrichment?.repo ?? repoFallback(evt) ?? 'Unknown repo';
    const number = enrichment?.pr_number ?? pr.number ?? raw.number ?? null;
    const title = enrichment?.title ?? pr.title ?? null;

    const merged = pr.merged === true;
    const action = merged ? 'merged' : enrichment?.action ?? raw.action ?? 'updated';

    const label = title ? `PR "${title}"` : number ? `PR #${number}` : 'PR';
    const key = `${repo}#${number ?? evt.id}`;

    deduped.set(key, { repo, label, action });
  }

  const lines = [];
  if (deduped.size === 0) {
    return { lines, count: 0 };
  }

  lines.push('Pull requests');
  for (const { repo, label, action } of deduped.values()) {
    lines.push(`• ${repo}: ${label} ${action}`);
  }

  return { lines, count: deduped.size };
};

const buildStructureSection = (events) => {
  const creates = events.filter((evt) => evt.eventType === 'CreateEvent');
  const lines = [];

  for (const evt of creates) {
    const enrichment = getEnrichment(evt, 'github_create_v1');
    const payload = evt.payload ?? {};
    const raw = payload.raw ?? {};

    const repo = enrichment?.repo ?? repoFallback(evt);
    const refType = enrichment?.ref_type ?? raw.ref_type ?? null;
    const refName = enrichment?.ref_name ?? raw.ref ?? null;

    if (!repo && !refType && !refName) {
      continue;
    }

    if (refType === 'repository') {
      lines.push(`• ${repo ?? 'Unknown repo'}: created repository`);
    } else if (refType === 'branch') {
      const branch = parseBranch(refName, null) ?? refName ?? 'new branch';
      lines.push(`• ${repo ?? 'Unknown repo'}: created branch ${branch}`);
    } else if (refType) {
      const suffix = refName ? ` ${refName}` : '';
      lines.push(`• ${repo ?? 'Unknown repo'}: created ${refType}${suffix}`);
    }
  }

  if (lines.length === 0) return { lines };
  lines.unshift('Structure');
  return { lines };
};

const buildExplorationSection = (events) => {
  const lines = [];

  const forks = events.filter((evt) => evt.eventType === 'ForkEvent');
  for (const evt of forks) {
    const enrichment = getEnrichment(evt, 'github_fork_v1');
    const payload = evt.payload ?? {};
    const raw = payload.raw ?? {};
    const forkee = raw.forkee ?? {};

    const source = enrichment?.source_repo ?? repoFallback(evt);
    const forked = enrichment?.forked_repo ?? forkee.full_name ?? forkee.name ?? null;

    if (source || forked) {
      lines.push(`• Forked ${source ?? 'a repository'}${forked ? ` -> ${forked}` : ''}`);
    }
  }

  const watches = events.filter((evt) => evt.eventType === 'WatchEvent');
  const starred = [];
  for (const evt of watches) {
    const enrichment = getEnrichment(evt, 'github_watch_v1');
    const repo = enrichment?.repo ?? repoFallback(evt);
    if (repo) starred.push(repo);
  }

  if (starred.length > 0) {
    const uniqueStarred = [...new Set(starred)];
    if (uniqueStarred.length <= 4) {
      for (const repo of uniqueStarred) {
        lines.push(`• Starred ${repo}`);
      }
    } else {
      lines.push(`• Starred ${uniqueStarred.length} repositories`);
    }
  }

  if (lines.length === 0) return { lines };
  lines.unshift('Exploration');
  return { lines };
};

const buildSummaryLines = ({ commits, repos, prCount }) => {
  const repoCount = repos.size;
  const prPart = `${prCount} PR` + (prCount === 1 ? '' : 's');
  return [
    `Today on GitHub: ${commits} commit${commits === 1 ? '' : 's'} · ${repoCount} repo${repoCount === 1 ? '' : 's'} · ${prPart}`,
    '(See full activity →)',
  ];
};

const build = (events) => {
  const lines = [DIVIDER, 'GitHub', DIVIDER, ''];

  const { lines: codeLines, stats } = buildCodeSection(events);
  if (codeLines.length) {
    lines.push(...codeLines, '');
  }

  const { lines: prLines, count: prCount } = buildPullRequestsSection(events);
  if (prLines.length) {
    lines.push(...prLines, '');
  }

  const { lines: structureLines } = buildStructureSection(events);
  if (structureLines.length) {
    lines.push(...structureLines, '');
  }

  const { lines: explorationLines } = buildExplorationSection(events);
  if (explorationLines.length) {
    lines.push(...explorationLines, '');
  }

  const summary = buildSummaryLines({ commits: stats.commits, repos: stats.repos, prCount });
  lines.push(...summary);

  // Remove possible trailing blank lines before summary when no sections rendered
  for (let i = lines.length - 3; i >= 0; i -= 1) {
    if (lines[i] === '') {
      lines.splice(i, 1);
    } else {
      break;
    }
  }

  return { title: 'GitHub', lines, skipTitle: true };
};

registerDigest({ source: 'github', build });

export default build;
