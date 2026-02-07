import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import { processMediaEmbeds } from '../utils/videoEmbed';
import trelloIcon from '../assets/trello.ico';
import githubIcon from '../assets/github.ico';
import goalsIcon from '../assets/goals.ico';
import spotifyIcon from '../assets/spotify.ico';
import steamIcon from '../assets/steam.ico';
import timelineIcon from '../assets/timeline.ico';
import journalIcon from '../assets/journal.ico';
import bookmarksIcon from '../assets/bookmarks.ico';
import amexIcon from '../assets/amex.ico';
import chimeIcon from '../assets/chime.ico';
import chaseIcon from '../assets/chase.ico';

const formatDateHeader = (dateStr) => {
  // dateStr is "YYYY-MM-DD"
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString(undefined, { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
};

const cToF = (c) => {
  const n = Number(c);
  if (!Number.isFinite(n)) return '';
  return Math.round(((n * 9) / 5 + 32) * 10) / 10;
};

// Section-specific renderers

const SpotifyDaySection = ({ section, date, expanded, onToggle }) => {
  if (!section) return null;

  const summary = section.summary || {};
  const plays = section.plays || [];

  return (
    <div className="box mb-4">
      <div 
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <p className="title is-6 mb-2">
          <span className="icon-text">
            <span className="icon has-text-success">
              <i className={`fas fa-chevron-${expanded ? 'down' : 'right'}`} />
            </span>
            <span>{formatDateHeader(date)}</span>
          </span>
        </p>
        <p className="is-size-7 has-text-grey">
          {summary.playCount || 0} plays · {summary.uniqueTracks || 0} tracks
          {summary.topGenres?.length ? ` · ${summary.topGenres.slice(0, 3).map(g => g.name).join(', ')}` : ''}
        </p>
      </div>

      {expanded && (
        <div className="mt-3">
          {summary.topArtists?.length ? (
            <div className="mb-3">
              <p className="has-text-weight-semibold is-size-7">Top Artists</p>
              {summary.topArtists.map((artist) => (
                <p key={artist.name} className="is-size-7">
                  {artist.name} ({artist.count} {artist.count === 1 ? 'play' : 'plays'})
                </p>
              ))}
            </div>
          ) : null}

          {plays.length ? (
            <div>
              <p className="has-text-weight-semibold is-size-7 mb-2">Tracks</p>
              {plays.map((play, idx) => (
                <div key={idx} className="is-size-7 mb-2">
                  <p>
                    {play.url ? (
                      <a href={play.url} target="_blank" rel="noreferrer" className="has-text-weight-semibold">
                        {play.trackName}
                      </a>
                    ) : (
                      <span className="has-text-weight-semibold">{play.trackName}</span>
                    )}
                  </p>
                  {play.artists?.length ? (
                    <p className="has-text-grey">{play.artists.join(', ')}</p>
                  ) : null}
                  {play.playedAt ? (
                    <p className="has-text-grey">
                      {new Date(play.playedAt).toLocaleTimeString(undefined, { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

const GithubDaySection = ({ section, date }) => {
  if (!section) return null;

  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">{formatDateHeader(date)}</p>
      
      {section.pushes?.length ? (
        section.pushes.map((push) => (
          <div key={`${push.repo}-${push.branch || 'main'}`} className="mb-3">
            <p className="has-text-weight-semibold is-size-7">
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
                  <a className="has-text-grey" href={detail.url} target="_blank" rel="noreferrer">
                    {detail.short || detail.message}
                  </a>
                ) : (
                  <>
                    {detail.short ? <span className="has-text-grey">({detail.short}) </span> : null}
                    {detail.message}
                  </>
                )}
              </p>
            ))}
          </div>
        ))
      ) : (
        <p className="has-text-grey is-size-7">No pushes</p>
      )}
    </div>
  );
};

const BookmarkDaySection = ({ section, date }) => {
  if (!section) return null;

  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">
        {formatDateHeader(date)} · {section.count || 0} bookmark{section.count === 1 ? '' : 's'}
      </p>
      
      {section.items?.length ? (
        section.items.map((item) => (
          <div key={item.url} className="mb-3">
            <a href={item.url} target="_blank" rel="noreferrer" className="has-text-weight-semibold is-size-7">
              {item.title}
            </a>
            {item.excerpt ? <p className="is-size-7 mt-1">{item.excerpt}</p> : null}
            {item.commentText ? (
              <p className="is-size-7 mt-1 has-text-grey-dark" style={{ fontStyle: 'italic' }}>
                {item.commentText}
              </p>
            ) : null}
            {item.sourceDomain ? (
              <p className="is-size-7 has-text-grey mt-1">via {item.sourceDomain}</p>
            ) : null}
          </div>
        ))
      ) : (
        <p className="has-text-grey is-size-7">No bookmarks</p>
      )}
    </div>
  );
};

const FinanceDaySection = ({ section, date }) => {
  if (!section) return null;

  const formatAmount = (amount) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '';
    return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };

  const getFinanceIcon = (institutionId) => {
    if (institutionId === 'amex') return amexIcon;
    if (institutionId === 'chime') return chimeIcon;
    if (institutionId === 'chase') return chaseIcon;
    return null;
  };

  const icon = getFinanceIcon(section.institutionId);

  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">
        {icon && <img src={icon} alt={section.institutionName || 'Finance'} className="section-icon" />}
        {formatDateHeader(date)} · {section.count || 0} transaction{section.count === 1 ? '' : 's'}
      </p>
      
      {section.transactions?.length ? (
        <div className="content">
          <table className="table is-fullwidth is-size-7">
            <tbody>
              {section.transactions.map((tx, idx) => (
                <tr key={`${tx.reference || idx}`}>
                  <td>{tx.description}</td>
                  <td className="has-text-right has-text-weight-semibold">
                    <span className={tx.amount < 0 ? 'has-text-success' : ''}>
                      {formatAmount(tx.amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="has-text-grey is-size-7">No transactions</p>
      )}
    </div>
  );
};

const SteamDaySection = ({ section, date }) => {
  if (!section) return null;

  const summary = section.summary || {};

  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">{formatDateHeader(date)}</p>
      
      {summary.totalMinutes ? (
        <p className="is-size-7 has-text-grey mb-2">
          {summary.totalMinutes} minutes played
        </p>
      ) : null}

      {section.sessions?.length ? (
        section.sessions.map((session, idx) => (
          <div key={idx} className="mb-2">
            <p className="has-text-weight-semibold is-size-7">{session.gameName}</p>
            <p className="is-size-7 has-text-grey">
              {session.minutesPlayed} minutes
              {session.achievementCount ? ` · ${session.achievementCount} achievements` : ''}
            </p>
          </div>
        ))
      ) : (
        <p className="has-text-grey is-size-7">No sessions</p>
      )}
    </div>
  );
};

const TimelineDaySection = ({ section, date }) => {
  if (!section) return null;

  const summary = section.summary || {};
  const weather = section.weather || {};

  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">{formatDateHeader(date)}</p>
      
      {weather.temp !== undefined ? (
        <p className="is-size-7 mb-2">
          🌡️ {cToF(weather.temp)}°F
          {weather.description ? ` · ${weather.description}` : ''}
        </p>
      ) : null}

      {summary.places?.length ? (
        <div>
          <p className="has-text-weight-semibold is-size-7 mb-1">Places</p>
          {summary.places.map((place, idx) => (
            <p key={idx} className="is-size-7">
              📍 {place.name || place.address || 'Unknown location'}
              {place.duration ? ` (${place.duration})` : ''}
            </p>
          ))}
        </div>
      ) : (
        <p className="has-text-grey is-size-7">No location data</p>
      )}
    </div>
  );
};

const TrelloDaySection = ({ section, date }) => {
  if (!section) return null;

  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">{formatDateHeader(date)}</p>
      
      {section.cards?.length ? (
        section.cards.map((card) => (
          <div key={card.id} className="mb-2">
            <p className="has-text-weight-semibold is-size-7">
              {card.url ? (
                <a href={card.url} target="_blank" rel="noreferrer">{card.name}</a>
              ) : (
                card.name
              )}
            </p>
            <p className="is-size-7 has-text-grey">
              {card.listName} · {card.action}
            </p>
          </div>
        ))
      ) : (
        <p className="has-text-grey is-size-7">No cards</p>
      )}
    </div>
  );
};

const JournalDaySection = ({ logs, goals, date }) => {
  return (
    <div className="box mb-4">
      <p className="title is-6 mb-2">{formatDateHeader(date)}</p>
      
      {goals?.length ? (
        <div className="mb-3">
          <p className="has-text-weight-semibold is-size-7 mb-2">Goals</p>
          {goals.map((goal) => (
            <p key={goal.id} className="is-size-7">
              <span className="icon">
                <i className={`fas fa-${goal.completed ? 'check-circle has-text-success' : 'circle'}`} />
              </span>
              {goal.text}
            </p>
          ))}
        </div>
      ) : null}

      {logs?.length ? (
        <div>
          <p className="has-text-weight-semibold is-size-7 mb-2">Logs</p>
          {logs.map((log) => (
            <div key={log.id} className="content is-size-7 mb-3">
              <div dangerouslySetInnerHTML={{ __html: marked(processMediaEmbeds(log.content)) }} />
              <p className="has-text-grey is-size-7">
                {new Date(log.createdAt).toLocaleTimeString(undefined, { 
                  hour: 'numeric', 
                  minute: '2-digit' 
                })}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {!goals?.length && !logs?.length ? (
        <p className="has-text-grey is-size-7">No entries</p>
      ) : null}
    </div>
  );
};

// Main Archive component

const SECTION_CONFIG = {
  spotify: {
    title: 'Spotify',
    icon: spotifyIcon,
    alt: 'Spotify',
    color: 'has-text-success',
  },
  github: {
    title: 'GitHub',
    icon: githubIcon,
    alt: 'GitHub',
    color: 'has-text-grey-dark',
  },
  steam: {
    title: 'Steam',
    icon: steamIcon,
    alt: 'Steam',
    color: 'has-text-info',
  },
  google_timeline: {
    title: 'Timeline',
    icon: timelineIcon,
    alt: 'Timeline',
    color: 'has-text-danger',
  },
  email_bookmarks: {
    title: 'Bookmarks',
    icon: bookmarksIcon,
    alt: 'Bookmarks',
    color: 'has-text-warning',
  },
  finance: {
    title: 'Finance',
    icon: null, // Varies by institution
    alt: 'Finance',
    color: 'has-text-success',
  },
  trello: {
    title: 'Trello',
    icon: trelloIcon,
    alt: 'Trello',
    color: 'has-text-info',
  },
  journal: {
    title: 'Journal',
    icon: journalIcon,
    alt: 'Journal',
    color: 'has-text-primary',
  },
};

export default function Archive({ source, onBack }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
  });
  const [dateRange, setDateRange] = useState({
    loading: true,
    minDate: null,
    maxDate: null,
    availableYears: [],
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedDays, setExpandedDays] = useState(new Set());

  const config = SECTION_CONFIG[source] || { 
    title: source, 
    icon: null, 
    alt: source,
    color: 'has-text-grey' 
  };

  // Fetch date range for this source
  useEffect(() => {
    const fetchDateRange = async () => {
      try {
        const endpoint = source === 'journal' 
          ? '/api/events/date-range'
          : `/api/events/date-range?source=${source}`;
        
        const res = await fetch(endpoint, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch date range');
        
        const data = await res.json();
        
        if (data.minDate && data.maxDate) {
          const minYear = new Date(data.minDate).getFullYear();
          const maxYear = new Date(data.maxDate).getFullYear();
          const years = [];
          for (let y = maxYear; y >= minYear; y--) {
            years.push(y);
          }
          
          setDateRange({
            loading: false,
            minDate: data.minDate,
            maxDate: data.maxDate,
            availableYears: years,
          });
          
          // Default to most recent year
          setSelectedYear(maxYear);
        } else {
          setDateRange({
            loading: false,
            minDate: null,
            maxDate: null,
            availableYears: [],
          });
        }
      } catch (error) {
        console.error('Failed to fetch date range:', error);
        setDateRange({
          loading: false,
          minDate: null,
          maxDate: null,
          availableYears: [],
        });
      }
    };

    fetchDateRange();
  }, [source]);

  // Fetch archive data for selected year
  useEffect(() => {
    if (!selectedYear) return;

    const fetchArchive = async () => {
      setState({ loading: true, error: null, data: null });
      
      try {
        const endpoint = source === 'journal'
          ? `/api/archive/journal?year=${selectedYear}`
          : `/api/archive/${source}?year=${selectedYear}`;
        
        const res = await fetch(endpoint, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch archive');
        
        const data = await res.json();
        setState({ loading: false, error: null, data });
      } catch (error) {
        console.error('Failed to fetch archive:', error);
        setState({ loading: false, error: error.message, data: null });
      }
    };

    fetchArchive();
  }, [source, selectedYear]);

  const toggleDay = (date) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const renderDay = (day) => {
    const expanded = expandedDays.has(day.date);

    if (source === 'journal') {
      return (
        <JournalDaySection
          key={day.date}
          logs={day.logs}
          goals={day.goals}
          date={day.date}
        />
      );
    }

    const section = day.section;

    switch (source) {
      case 'spotify':
        return (
          <SpotifyDaySection
            key={day.date}
            section={section}
            date={day.date}
            expanded={expanded}
            onToggle={() => toggleDay(day.date)}
          />
        );
      case 'github':
        return <GithubDaySection key={day.date} section={section} date={day.date} />;
      case 'email_bookmarks':
        return <BookmarkDaySection key={day.date} section={section} date={day.date} />;
      case 'finance':
        return <FinanceDaySection key={day.date} section={section} date={day.date} />;
      case 'steam':
        return <SteamDaySection key={day.date} section={section} date={day.date} />;
      case 'google_timeline':
        return <TimelineDaySection key={day.date} section={section} date={day.date} />;
      case 'trello':
        return <TrelloDaySection key={day.date} section={section} date={day.date} />;
      default:
        return (
          <div key={day.date} className="box mb-4">
            <p className="title is-6">{formatDateHeader(day.date)}</p>
            <pre className="is-size-7">{JSON.stringify(section, null, 2)}</pre>
          </div>
        );
    }
  };

  return (
    <div>
      <div className="box">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <button
            className="button is-small is-light"
            onClick={onBack}
            title="Back to digest"
          >
            <span className="icon">
              <i className="fas fa-arrow-left" />
            </span>
          </button>
          
          <div style={{ flex: 1 }}>
            <p className="title is-4">
              {config.icon && <img src={config.icon} alt={config.alt} className="section-icon" />}
              {config.title} Archive
            </p>
          </div>

          {dateRange.availableYears.length > 0 && (
            <div className="select is-small">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              >
                {dateRange.availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {state.loading ? (
          <p className="has-text-grey">Loading archive...</p>
        ) : state.error ? (
          <p className="has-text-danger">Error: {state.error}</p>
        ) : !state.data?.days?.length ? (
          <p className="has-text-grey">No data for {selectedYear}</p>
        ) : (
          <p className="is-size-7 has-text-grey">
            {state.data.totalDays} day{state.data.totalDays === 1 ? '' : 's'} with activity in {selectedYear}
          </p>
        )}
      </div>

      {state.data?.days?.length ? (
        <div>
          {state.data.days.map(renderDay)}
        </div>
      ) : null}
    </div>
  );
}
