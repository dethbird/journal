import React, { useEffect, useState } from 'react';

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
};

const GithubSection = ({ section }) => {
  if (!section) return null;
  return (
    <div className="box">
      <p className="title is-5">GitHub</p>
      {section.pushes?.length ? (
        section.pushes.map((push) => (
          <div key={`${push.repo}-${push.branch || 'main'}`} className="mb-3">
            <p className="has-text-weight-semibold">
              {push.repo} {push.branch ? <span className="has-text-grey">({push.branch})</span> : null}
            </p>
            <p className="is-size-7 has-text-grey">{push.commits} commit{push.commits === 1 ? '' : 's'}</p>
            {push.details?.map((detail, idx) => (
              <p key={idx} className="is-size-7">
                {detail.short ? <span className="has-text-grey">({detail.short}) </span> : null}
                {detail.message}
              </p>
            ))}
          </div>
        ))
      ) : (
        <p className="has-text-grey">No pushes</p>
      )}

      {section.prs?.length ? (
        <div className="mt-2">
          <p className="has-text-weight-semibold">Pull requests</p>
          {section.prs.map((pr) => (
            <p key={`${pr.repo}-${pr.label}`} className="is-size-7">
              {pr.repo}: {pr.label} {pr.action}
            </p>
          ))}
        </div>
      ) : null}

      <p className="is-size-7 has-text-weight-semibold mt-3">
        Summary: {section.summary?.commits ?? 0} commits · {section.summary?.repoCount ?? 0} repos ·{' '}
        {section.summary?.prCount ?? 0} PRs
      </p>
    </div>
  );
};

const BookmarkSection = ({ section }) => {
  if (!section) return null;
  return (
    <div className="box">
      <p className="title is-5">Bookmarks ({section.count ?? 0})</p>
      {section.items?.length ? (
        section.items.map((item) => (
          <div key={item.url} className="mb-3">
            <a href={item.url} target="_blank" rel="noreferrer" className="has-text-weight-semibold">
              {item.title}
            </a>
            {item.excerpt ? <p className="is-size-7 mt-1">{item.excerpt}</p> : null}
            {item.occurredAt ? (
              <p className="is-size-7 has-text-grey mt-1">Saved {formatTime(item.occurredAt)}</p>
            ) : null}
          </div>
        ))
      ) : (
        <p className="has-text-grey">No bookmarks</p>
      )}
    </div>
  );
};

const MusicSection = ({ section }) => {
  if (!section) return null;
  const summary = section.summary ?? {};
  return (
    <div className="box">
      <p className="title is-5">Spotify</p>
      <p className="is-size-6">
        {summary.playCount ?? 0} plays · {summary.uniqueTracks ?? 0} tracks
        {summary.durationLabel ? ` · ${summary.durationLabel}` : ''}
      </p>
      {summary.topArtists?.length ? (
        <p className="is-size-7 has-text-grey">
          Top artists: {summary.topArtists.map((a) => `${a.name} (${a.count})`).join(', ')}
        </p>
      ) : null}
      {summary.topTracks?.length ? (
        <p className="is-size-7 has-text-grey">
          Most played: {summary.topTracks.map((t) => `${t.name} (${t.count})`).join(', ')}
        </p>
      ) : null}

      <div className="mt-3">
        {section.plays?.length ? (
          section.plays.map((play, idx) => (
            <div key={`${play.trackName}-${idx}`} className="mb-2">
              <p className="has-text-weight-semibold">
                {play.trackName}
                {play.artists?.length ? <span className="has-text-grey"> — {play.artists.join(', ')}</span> : null}
              </p>
              {play.playedAt ? (
                <p className="is-size-7 has-text-grey">Played {formatTime(play.playedAt)}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="has-text-grey">No recent plays</p>
        )}
      </div>
    </div>
  );
};

export default function Digest() {
  const [state, setState] = useState({ loading: true, error: null, vm: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/digest');
        if (!res.ok) {
          throw new Error(`Digest fetch failed (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, error: null, vm: data });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message, vm: null });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="box">
        <p className="subtitle is-6">Loading digest…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="box">
        <p className="subtitle is-6 has-text-danger">{state.error}</p>
      </div>
    );
  }

  const { vm } = state;
  return (
    <div>
      <div className="box">
        <h2 className="title is-4">Digest</h2>
        <p className="subtitle is-6">
          Window: {formatTime(vm.window?.start)} → {formatTime(vm.window?.end)}
        </p>
        {!vm.sections?.length && <p className="has-text-grey">No events in this window.</p>}
      </div>

      {vm.sections?.map((section, idx) => {
        if (section.kind === 'github') return <GithubSection key={`s-${idx}`} section={section} />;
        if (section.kind === 'bookmarks') return <BookmarkSection key={`s-${idx}`} section={section} />;
        if (section.kind === 'music') return <MusicSection key={`s-${idx}`} section={section} />;
        return null;
      })}
    </div>
  );
}
