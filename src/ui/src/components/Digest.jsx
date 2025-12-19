import React, { useEffect, useState } from 'react';
import { marked } from 'marked';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const buildWindow = (offsetDays) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const start = new Date(todayStart.getTime() + offsetDays * DAY_MS);
  const end = offsetDays === 0 ? now : new Date(start.getTime() + DAY_MS);
  return { start, end };
};

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
};

const formatDateISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const cToF = (c) => {
  const n = Number(c);
  if (!Number.isFinite(n)) return '';
  return Math.round(((n * 9) / 5 + 32) * 10) / 10;
};

/**
 * Parse frontmatter from markdown content.
 */
const parseFrontmatter = (content) => {
  if (!content || !content.startsWith('---')) {
    return { frontmatter: {}, body: content || '' };
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: content };
  }
  const fmBlock = content.slice(4, endIdx);
  const body = content.slice(endIdx + 4).replace(/^\n/, '');

  const frontmatter = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      }
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
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
              {push.repoUrl ? (
                <a href={push.repoUrl} target="_blank" rel="noreferrer">
                  {push.repo}
                </a>
              ) : (
                push.repo
              )}{' '}
              {push.branch ? <span className="has-text-grey">({push.branch})</span> : null}
            </p>
            <p className="is-size-7 has-text-grey">{push.commits} commit{push.commits === 1 ? '' : 's'}</p>
            {(push.details ?? []).map((detail, idx) => (
              <p key={detail.sha || detail.url || idx} className="is-size-7">
                {detail.url ? (
                  <a className="has-text-grey" href={detail.url} target="_blank" rel="noreferrer">{detail.short || detail.message}</a>
                ) : (
                  detail.short ? <span className="has-text-grey">({detail.short}) </span> : null
                )}
                {detail.short ? ' ' : null}
                {detail.message}
                {detail.date ? (
                  <span className="has-text-grey is-size-7"> · {new Date(detail.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                ) : null}
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
          <div key={item.url} className="mb-3 is-flex">
            {item.imageUrl ? (
              <div className="mr-3">
                <a href={item.url} target="_blank" rel="noreferrer">
                  <img src={item.imageUrl} alt="" className="bookmark-thumb" />
                </a>
              </div>
            ) : null}
            <div>
              <a href={item.url} target="_blank" rel="noreferrer" className="has-text-weight-semibold">
                {item.title}
              </a>
              {item.excerpt ? <p className="is-size-7 mt-1">{item.excerpt}</p> : null}
              {item.occurredAt ? (
                <p className="is-size-7 has-text-grey mt-1">Saved {formatTime(item.occurredAt)}</p>
              ) : null}
            </div>
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
            <div key={`${play.trackName}-${idx}`} className="mb-2 is-flex is-align-items-center">
              {play.albumImage ? (
                <div className="mr-3">
                  {play.url ? (
                    <a href={play.url} target="_blank" rel="noreferrer">
                      <img src={play.albumImage} alt="" className="album-thumb" />
                    </a>
                  ) : (
                    <img src={play.albumImage} alt="" className="album-thumb" />
                  )}
                </div>
              ) : null}
              <div>
                <p className="has-text-weight-semibold">
                  {play.trackName}
                  {play.artists?.length ? <span className="has-text-grey"> — {play.artists.join(', ')}</span> : null}
                </p>
                {play.playedAt ? (
                  <p className="is-size-7 has-text-grey">Played {formatTime(play.playedAt)}</p>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="has-text-grey">No recent plays</p>
        )}
      </div>
    </div>
  );
};

const TimelineSection = ({ section }) => {
  if (!section) return null;
  const summary = section.summary ?? {};

  return (
    <div className="box">
      <p className="title is-5">Timeline</p>
      <p className="is-size-6">
        {summary.totalVisits ?? 0} visits · {summary.totalActivities ?? 0} activities
        {summary.totalDistance ? ` · ${summary.totalDistance}` : ''}
        {summary.totalActivityTime ? ` · ${summary.totalActivityTime} active` : ''}
      </p>

      {summary.activityBreakdown?.length ? (
        <p className="is-size-7 has-text-grey">
          Activities: {summary.activityBreakdown.map((a) => `${a.label} (${a.count})`).join(', ')}
        </p>
      ) : null}

      {summary.visitBreakdown?.length ? (
        <p className="is-size-7 has-text-grey">
          Places: {summary.visitBreakdown.map((v) => `${v.label} (${v.count})`).join(', ')}
        </p>
      ) : null}

      <div className="mt-3">
        {section.items?.length ? (
          section.items.slice(0, 20).map((item, idx) => (
            <div key={`timeline-${idx}`} className="mb-2">
              <p className="has-text-weight-semibold">
                {item.label}
                {item.duration ? <span className="has-text-grey"> · {item.duration}</span> : null}
                {item.distance ? <span className="has-text-grey"> · {item.distance}</span> : null}
              </p>
              {item.occurredAt ? (
                <p className="is-size-7 has-text-grey">{formatTime(item.occurredAt)}</p>
              ) : null}
              {item.destinations?.length ? (
                <p className="is-size-7">{item.destinations.join(' → ')}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="has-text-grey">No timeline events</p>
        )}
        {section.items?.length > 20 ? (
          <p className="is-size-7 has-text-grey">...and {section.items.length - 20} more</p>
        ) : null}
      </div>
    </div>
  );
};

const JournalSection = ({ entry }) => {
  if (!entry) return null;
  const { frontmatter, body } = parseFrontmatter(entry.content);
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

  return (
    <div className="box">
      <div className="is-flex is-align-items-center is-justify-content-space-between mb-2">
        <p className="title is-5 mb-0">Journal</p>
        <a
          href="/journal"
          className="button is-small is-light"
          onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, '', '/journal');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        >
          <span className="icon">
            <i className="fa-solid fa-pen-to-square" />
          </span>
          <span>Edit</span>
        </a>
      </div>
      {body ? (
        <div className="journal-entry content" dangerouslySetInnerHTML={{ __html: marked(body) }} />
      ) : (
        <p className="has-text-grey">No journal content</p>
      )}
      {(frontmatter.mood || frontmatter.energy || tags.length > 0) && (
        <div className="mt-3">
          {frontmatter.mood && (
            <span className="tag is-info is-light mr-2">Mood: {frontmatter.mood}</span>
          )}
          {frontmatter.energy && (
            <span className="tag is-success is-light mr-2">Energy: {frontmatter.energy}</span>
          )}
          {tags.map((tag) => (
            <span key={tag} className="tag is-light mr-1">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default function Digest({ offsetDays = 0 }) {
  const [state, setState] = useState({ loading: true, error: null, vm: null });
  const [journalEntry, setJournalEntry] = useState(null);
  const [sendState, setSendState] = useState({ sending: false, message: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const { start, end } = buildWindow(offsetDays);
    const dateISO = formatDateISO(start);

    const load = async () => {
      try {
        setState({ loading: true, error: null, vm: null });
        setJournalEntry(null);

        // Fetch digest and journal in parallel
        const [digestRes, journalRes] = await Promise.all([
          fetch(`/api/digest?since=${start.toISOString()}&until=${end.toISOString()}`, { credentials: 'include' }),
          fetch(`/api/journal?date=${dateISO}`, { credentials: 'include' }),
        ]);

        if (!digestRes.ok) {
          throw new Error(`Digest fetch failed (${digestRes.status})`);
        }
        const digestData = await digestRes.json();

        let journalData = null;
        if (journalRes.ok) {
          journalData = await journalRes.json();
        }

        if (!cancelled) {
          setState({ loading: false, error: null, vm: digestData });
          setJournalEntry(journalData?.entry || null);
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message, vm: null });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [offsetDays]);

  const handleSend = async () => {
    const { start, end } = buildWindow(offsetDays);
    setSendState({ sending: true, message: null, error: null });
    try {
      const res = await fetch(`/api/digest/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: start.toISOString(), until: end.toISOString() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Send failed (${res.status})`);
      }
      setSendState({ sending: false, message: 'Sent!', error: null });
      setTimeout(() => setSendState((s) => ({ ...s, message: null })), 2500);
    } catch (err) {
      setSendState({ sending: false, message: null, error: err.message });
    }
  };


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
  const weather = vm?.weather;
  return (
    <div>
      {/* Journal entry at the top if present */}
      <JournalSection entry={journalEntry} />

      <div className="box">
        <div className="is-flex is-align-items-center is-justify-content-space-between">
          <h2 className="title is-4 mb-0">Digest</h2>
          <div className="is-flex is-align-items-center">
            <button
              className={`button is-small is-info mr-2${sendState.sending ? ' is-loading' : ''}`}
              onClick={handleSend}
              disabled={sendState.sending}
              title="Send digest for this window"
            >
              <span className="icon">
                <i className="fa-solid fa-envelope" />
              </span>
              <span className="is-hidden-mobile">Send</span>
            </button>
            {sendState.message ? <span className="has-text-success mr-2">{sendState.message}</span> : null}
            {sendState.error ? <span className="has-text-danger mr-2">{sendState.error}</span> : null}
            {weather ? (
              <div className="has-text-right">
                <p className="is-size-7 has-text-grey">
                  {weather.weather_description} · {weather.temperature_c}°C ({cToF(weather.temperature_c)}°F)
                </p>
              </div>
            ) : null}
          </div>
        </div>
        {!vm.sections?.length && !journalEntry && <p className="has-text-grey mt-3">No events in this window.</p>}
      </div>

      {vm.sections?.map((section, idx) => {
        if (section.kind === 'github') return <GithubSection key={`s-${idx}`} section={section} />;
        if (section.kind === 'bookmarks') return <BookmarkSection key={`s-${idx}`} section={section} />;
        if (section.kind === 'music') return <MusicSection key={`s-${idx}`} section={section} />;
        if (section.kind === 'timeline') return <TimelineSection key={`s-${idx}`} section={section} />;
        return null;
      })}
    </div>
  );
}
