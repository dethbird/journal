import { Octokit } from '@octokit/rest';
import { registerCollector } from './runner.js';

const source = 'github';
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const branch = process.env.GITHUB_BRANCH ?? 'main';
const token = process.env.GITHUB_TOKEN;

const octokit = token ? new Octokit({ auth: token }) : null;

const defaultSince = () => new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

const formatCommit = (commit) => {
  const commitDate = commit.commit?.committer?.date ?? commit.commit?.author?.date;
  return {
    eventType: 'commit',
    occurredAt: commitDate ?? new Date().toISOString(),
    externalId: commit.sha,
    payload: {
      message: commit.commit?.message,
      url: commit.html_url,
      author: {
        name: commit.commit?.author?.name,
        email: commit.commit?.author?.email,
        username: commit.author?.login,
        avatarUrl: commit.author?.avatar_url,
      },
      committer: {
        name: commit.commit?.committer?.name,
        email: commit.commit?.committer?.email,
      },
      repo: owner && repo ? `${owner}/${repo}` : null,
      raw: commit,
    },
  };
};

const collect = async (cursor) => {
  if (!owner || !repo || !octokit) {
    console.warn('GitHub collector missing configuration (set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)');
    return { items: [], nextCursor: cursor };
  }

  const since = cursor ?? defaultSince();
  const commits = [];
  let page = 1;

  while (true) {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      since,
      per_page: 100,
      page,
    });

    if (response.data.length === 0) {
      break;
    }

    commits.push(...response.data);
    if (response.data.length < 100) {
      break;
    }
    page += 1;
  }

  if (commits.length === 0) {
    return { items: [], nextCursor: cursor };
  }

  const items = commits.map(formatCommit);
  const newest = commits[0];
  const nextCursor = newest?.commit?.committer?.date ?? newest?.commit?.author?.date ?? new Date().toISOString();

  return { items, nextCursor };
};

registerCollector({ source, collect });

export default collect;
