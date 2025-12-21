import React, { useEffect, useState } from 'react';
import trelloIcon from '../assets/trello.ico';
import githubIcon from '../assets/github.ico';
import goalsIcon from '../assets/goals.ico';
import spotifyIcon from '../assets/spotify.ico';
import timelineIcon from '../assets/timeline.ico';
import journalIcon from '../assets/journal.ico';
import bookmarksIcon from '../assets/bookmarks.ico';
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

const GithubSection = ({ section, inCard = false }) => {
  if (!section) return null;

  const content = (
    <>
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
    </>
  );

  if (inCard) return <div>{content}</div>;

  return (
    <div className="box">
      <p className="title is-5">
        <img src={githubIcon} alt="GitHub" className="section-icon" />
        GitHub
      </p>
      {content}
    </div>
  );
};

const BookmarkSection = ({ section }) => {
  if (!section) return null;
  return (
    <div className="box">
      <p className="title is-5">
        <img src={bookmarksIcon} alt="Bookmarks" className="section-icon" />
        Bookmarks ({section.count ?? 0})
      </p>
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

const MusicSection = ({ section, inCard = false }) => {
  if (!section) return null;
  const summary = section.summary ?? {};

  const content = (
    <>
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
                  {play.uri ? (
                    <a href={play.uri} className="has-text-weight-semibold" target="_blank" rel="noreferrer">
                      {play.trackName}
                    </a>
                  ) : (
                    play.trackName
                  )}
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
    </>
  );

  if (inCard) return <div>{content}</div>;

  return (
    <div className="box">
      <p className="title is-5">
        <img src={spotifyIcon} alt="Spotify" className="section-icon" />
        Spotify
      </p>
      {content}
    </div>
  );
};

const TimelineSection = ({ section, inCard = false }) => {
  if (!section) return null;
  const summary = section.summary ?? {};

  const content = (
    <>
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
    </>
  );

  if (inCard) return <div>{content}</div>;

  return (
    <div className="box">
      <p className="title is-5">
        <img src={timelineIcon} alt="Timeline" className="section-icon" />
        Timeline
      </p>
      {content}
    </div>
  );
};

const TrelloSection = ({ section, inCard = false }) => {
  if (!section) return null;
  const summary = section.summary ?? {};

  const formatCardTime = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return iso;
    }
  };

  const content = (
    <>
      <p className="is-size-6">
        {summary.totalCardsMoved ?? 0} cards moved · {summary.totalCardsCreated ?? 0} created
        {summary.boardCount ? ` · ${summary.boardCount} boards` : ''}
      </p>

      <div className="mt-3">
        {section.boards?.length ? (
          section.boards.map((board) => (
            <div key={board.id} className="mb-4">
              <p className="has-text-weight-semibold">
                {board.name}
                <span className="has-text-grey is-size-7 ml-2">({board.actionCount} actions)</span>
              </p>
              {board.cards?.length ? (
                <div className="ml-3 mt-2">
                  {board.cards.map((card, idx) => (
                    <div key={card.id || idx} className="mb-2">
                      <p>
                        {card.url ? (
                          <a href={card.url} target="_blank" rel="noreferrer" className="has-text-weight-medium">
                            {card.name}
                          </a>
                        ) : (
                          <span className="has-text-weight-medium">{card.name}</span>
                        )}
                        {card.isNew ? (
                          <span className="tag is-success is-light ml-2">new</span>
                        ) : card.listBefore ? (
                          <span className="has-text-grey is-size-7 ml-2">
                            {card.listBefore} → {card.listName}
                          </span>
                        ) : (
                          <span className="tag is-info is-light ml-2">{card.listName}</span>
                        )}
                      </p>
                      {card.occurredAt || card.member ? (
                        <p className="is-size-7 has-text-grey">
                          {card.occurredAt ? formatCardTime(card.occurredAt) : null}
                          {card.member ? ` · ${card.member}` : null}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="has-text-grey">No Trello activity</p>
        )}
      </div>
    </>
  );

  if (inCard) return <div>{content}</div>;

  return (
    <div className="box">
      <p className="title is-5">
        <img src={trelloIcon} alt="Trello" className="section-icon" />
        Trello
      </p>
      {content}
    </div>
  );
};

const JournalSection = ({ logs, goals, onToggleGoal }) => {
  if ((!logs || logs.length === 0) && (!goals || goals.length === 0)) return null;

  const formatLogTime = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return iso;
    }
  };

  return (
    <div className="columns is-multiline">
      {logs && logs.length > 0 ? (
        <div className="column is-12-mobile is-6-desktop">
          <div className="box">
              <p className="title is-5">
                <img src={journalIcon} alt="Journal" className="section-icon" />
                Journal
              </p>
            <div className="journal-logs">
              {logs.map((log) => (
                <div key={log.id} className="mb-3">
                  <p className="is-size-7 has-text-grey mb-1">{formatLogTime(log.createdAt)}</p>
                  <div className="journal-entry content" dangerouslySetInnerHTML={{ __html: marked(log.content || '') }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {goals && goals.length > 0 ? (
        <div className="column is-12-mobile is-6-desktop">
          <div className="box">
            <p className="title is-5">
              <img src={goalsIcon} alt="Goals" className="section-icon" />
              Goals
            </p>
            <div className="goals-list">
              {goals.map((goal) => (
                <div key={goal.id} className="is-flex is-align-items-center mb-2">
                  <label className="checkbox is-flex is-align-items-center">
                    <input
                      type="checkbox"
                      checked={goal.completed}
                      onChange={() => onToggleGoal && onToggleGoal(goal.id, goal.completed)}
                      className="mr-2"
                    />
                    <span className={goal.completed ? 'has-text-grey-light' : ''} style={goal.completed ? { textDecoration: 'line-through' } : {}}>
                      {goal.text}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default function Digest({ offsetDays = 0, onWeather }) {
  const [state, setState] = useState({ loading: true, error: null, vm: null });
  const [logs, setLogs] = useState([]);
  const [goals, setGoals] = useState([]);
  const [sendState, setSendState] = useState({ sending: false, message: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const { start, end } = buildWindow(offsetDays);
    const dateISO = formatDateISO(start);

    const load = async () => {
      try {
        setState({ loading: true, error: null, vm: null });
        setLogs([]);
        setGoals([]);

        // Fetch digest, logs, and goals in parallel
        const [digestRes, logsRes, goalsRes] = await Promise.all([
          fetch(`/api/digest?since=${start.toISOString()}&until=${end.toISOString()}`, { credentials: 'include' }),
          fetch(`/api/logs?date=${dateISO}`, { credentials: 'include' }),
          fetch(`/api/goals?date=${dateISO}`, { credentials: 'include' }),
        ]);

        if (!digestRes.ok) {
          throw new Error(`Digest fetch failed (${digestRes.status})`);
        }
        const digestData = await digestRes.json();

        let logsData = [];
        if (logsRes.ok) {
          const ld = await logsRes.json();
          // Sort oldest first for display
          logsData = (ld.logs || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        let goalsData = [];
        if (goalsRes.ok) {
          const gd = await goalsRes.json();
          goalsData = gd.goals || [];
        }

        if (!cancelled) {
          setState({ loading: false, error: null, vm: digestData });
          setLogs(logsData);
          setGoals(goalsData);
          try {
            if (onWeather) onWeather(digestData?.weather ?? null);
          } catch (e) {
            /* ignore */
          }
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

  const handleToggleGoal = async (goalId, completed) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
      if (!res.ok) throw new Error('Failed to toggle goal');
      const data = await res.json();
      setGoals((prev) => prev.map((g) => (g.id === goalId ? data.goal : g)));
    } catch (err) {
      console.error('Toggle goal error:', err);
    }
  };

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
  return (
    <div>
      {/* Journal entry at the top if present */}
      <JournalSection logs={logs} goals={goals} onToggleGoal={handleToggleGoal} />
      {/* removed Digest header box; weather is lifted to App */}
      {!vm.sections?.length && logs.length === 0 && goals.length === 0 && <div className="box"><p className="has-text-grey mt-3">No events in this window.</p></div>}

      {
        (() => {
          const github = vm.sections?.find((s) => s.kind === 'github') ?? null;
          const trello = vm.sections?.find((s) => s.kind === 'trello') ?? null;
          const music = vm.sections?.find((s) => s.kind === 'music') ?? null;
          const timeline = vm.sections?.find((s) => s.kind === 'timeline') ?? null;
          const other = (vm.sections || []).filter((s) => !['github', 'trello', 'music', 'timeline'].includes(s.kind));

          return (
            <>
              {(github || trello) ? (
                <div className="columns is-multiline">
                  {github ? (
                    <div className="column is-12-mobile is-6-desktop">
                      <GithubSection section={github} />
                    </div>
                  ) : null}
                  {trello ? (
                    <div className="column is-12-mobile is-6-desktop">
                      <TrelloSection section={trello} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {(music || timeline) ? (
                <div className="columns is-multiline">
                  {music ? (
                    <div className="column is-12-mobile is-6-desktop">
                      <MusicSection section={music} />
                    </div>
                  ) : null}
                  {timeline ? (
                    <div className="column is-12-mobile is-6-desktop">
                      <TimelineSection section={timeline} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {other.map((section, idx) => {
                if (section.kind === 'bookmarks') return <BookmarkSection key={`s-${idx}`} section={section} />;
                return null;
              })}
            </>
          );
        })()
      }
    </div>
  );
}
