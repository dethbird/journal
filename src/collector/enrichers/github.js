const extractRepoName = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  return (
    event.repo?.name ??
    payload.repo?.name ??
    payload.repo?.full_name ??
    raw.repo?.full_name ??
    raw.repo?.name ??
    payload.repoName ??
    null
  );
};

const extractBranch = (raw, payload) => {
  const ref = raw?.ref ?? payload?.ref ?? payload?.branch ?? null;
  if (typeof ref === 'string' && ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }
  return payload?.branch ?? raw?.branch ?? null;
};

const extractPushFields = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  const repoName = extractRepoName(event);
  const head = payload.head ?? raw.head ?? null;
  const before = payload.before ?? raw.before ?? null;
  const ref = raw.ref ?? payload.ref ?? null;
  const branch = payload.branch ?? (typeof ref === 'string' && ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : raw.branch ?? null);
  return { repoName, head, before, branch };
};

const parseOwnerRepo = (fullName) => {
  if (!fullName || typeof fullName !== 'string') return { owner: null, repo: null };
  const [owner, repo] = fullName.split('/') ?? [];
  return { owner: owner || null, repo: repo || null };
};

const buildPush = async (event, octokit) => {
  const { repoName, head, before, branch } = extractPushFields(event);

  if (!repoName || !head) {
    return {
      enrichmentType: 'github_push_v1',
      data: {
        status: 'skipped_missing_repo_or_head',
        repo: repoName ?? null,
        head: head ?? null,
        before: before ?? null,
        branch: branch ?? null,
      },
    };
  }

  const base = {
    repo: repoName,
    branch,
    before,
    head,
    commit_count: null,
    commit_subjects: [],
    commits: [],
    compare_url: null,
    stats: null,
    status: 'ok_head_only',
  };

  const { owner, repo } = parseOwnerRepo(repoName);
  const canCompare = owner && repo && before && head && before !== head && octokit;

  if (canCompare) {
    try {
      const res = await octokit.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${before}...${head}` });
      const commits = res.data?.commits ?? [];
      const subjects = commits
        .map((c) => c.commit?.message?.split('\n')[0] || null)
        .filter(Boolean)
        .slice(0, 3);

      const commitDetails = commits.slice(0, 10).map((c) => ({
        sha: c.sha,
        short_sha: c.sha ? c.sha.slice(0, 7) : null,
        message: c.commit?.message?.split('\n')[0] || null,
        author: c.commit?.author?.name ?? c.author?.login ?? null,
        date: c.commit?.author?.date ?? null,
        url: c.html_url ?? null,
      }));

      const stats = res.data?.files
        ? {
            additions: res.data.files.reduce((acc, f) => acc + (f.additions ?? 0), 0),
            deletions: res.data.files.reduce((acc, f) => acc + (f.deletions ?? 0), 0),
            files_changed: res.data.files.length,
          }
        : null;

      return {
        enrichmentType: 'github_push_v1',
        data: {
          ...base,
          commit_count: commits.length,
          commit_subjects: subjects,
          commits: commitDetails.filter((c) => c.message),
          compare_url: res.data?.html_url ?? base.compare_url,
          stats,
          status: 'ok_compare',
        },
      };
    } catch (error) {
      const status = error?.status === 403 ? 'error_rate_limited' : 'error_http';
      return { enrichmentType: 'github_push_v1', data: { ...base, status } };
    }
  }

  if (owner && repo && octokit) {
    try {
      const commit = await octokit.rest.repos.getCommit({ owner, repo, ref: head });
      const subject = commit.data?.commit?.message?.split('\n')[0] ?? null;
      const commitEntry = {
        sha: commit.data?.sha ?? null,
        short_sha: commit.data?.sha ? commit.data.sha.slice(0, 7) : null,
        message: subject,
        author: commit.data?.commit?.author?.name ?? commit.data?.author?.login ?? null,
        date: commit.data?.commit?.author?.date ?? null,
        url: commit.data?.html_url ?? null,
      };
      return {
        enrichmentType: 'github_push_v1',
        data: {
          ...base,
          commit_count: subject ? 1 : null,
          commit_subjects: subject ? [subject] : [],
          commits: subject ? [commitEntry] : [],
          status: 'ok_head_only',
        },
      };
    } catch (error) {
      const status = error?.status === 403 ? 'error_rate_limited' : 'error_http';
      return { enrichmentType: 'github_push_v1', data: { ...base, status } };
    }
  }

  return { enrichmentType: 'github_push_v1', data: base };
};

const buildPullRequest = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  const pr = raw.pull_request ?? {};
  const repo = extractRepoName(event);

  if (!repo && !pr?.number) return null;

  return {
    enrichmentType: 'github_pr_v1',
    data: {
      repo: repo ?? null,
      action: raw?.action ?? payload?.action ?? null,
      pr_number: pr.number ?? raw?.number ?? null,
      title: pr.title ?? payload?.title ?? null,
      base_branch: pr.base?.ref ?? pr.base?.branch ?? null,
      head_branch: pr.head?.ref ?? pr.head?.branch ?? null,
      pr_url: pr.html_url ?? pr.url ?? null,
      status: 'ok',
    },
  };
};

const buildFork = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  const forkee = raw.forkee ?? {};
  const sourceRepo = event.repo?.name ?? payload?.repo?.name ?? raw?.repo?.full_name ?? null;
  const forked = forkee.full_name ?? forkee.name ?? null;

  if (!sourceRepo && !forked) return null;

  return {
    enrichmentType: 'github_fork_v1',
    data: {
      source_repo: sourceRepo,
      forked_repo: forked,
      description: forkee.description ?? payload?.description ?? null,
      license: forkee.license?.spdx_id ?? forkee.license?.name ?? null,
      visibility: typeof forkee.private === 'boolean' ? (forkee.private ? 'private' : 'public') : null,
      status: 'ok',
    },
  };
};

const buildWatch = (event) => {
  const repo = extractRepoName(event);
  if (!repo) return null;
  return {
    enrichmentType: 'github_watch_v1',
    data: {
      repo,
      status: 'ok',
    },
  };
};

const buildCreate = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  const repo = extractRepoName(event);
  const ref = raw?.ref ?? payload?.ref ?? null;
  const refType = raw?.ref_type ?? payload?.ref_type ?? null;

  if (!repo && !ref && !refType) return null;

  return {
    enrichmentType: 'github_create_v1',
    data: {
      repo: repo ?? null,
      ref_type: refType,
      ref_name: ref,
      description: raw?.description ?? payload?.description ?? null,
      status: 'ok',
    },
  };
};

export const buildGithubEnrichment = async (event, octokit) => {
  switch (event.type) {
    case 'PushEvent':
      return buildPush(event, octokit);
    case 'PullRequestEvent':
      return buildPullRequest(event);
    case 'ForkEvent':
      return buildFork(event);
    case 'WatchEvent':
      return buildWatch(event);
    case 'CreateEvent':
      return buildCreate(event);
    default:
      return null;
  }
};

export default buildGithubEnrichment;
