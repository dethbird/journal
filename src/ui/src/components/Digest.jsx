import React, { useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
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
import { marked } from 'marked';
import { processMediaEmbeds } from '../utils/videoEmbed';

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

// Animated wrapper for digest sections
const AnimatedSection = ({ children, delay = 0 }) => {
  const sectionRef = useRef(null);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    // Set initial state
    gsap.set(element, {
      opacity: 0,
      y: 30,
    });

    // Animate in
    const animation = gsap.to(element, {
      opacity: 1,
      y: 0,
      duration: 0.6,
      delay: delay,
      ease: 'power3.out',
    });

    return () => {
      animation.kill();
    };
  }, [delay]);

  return <div ref={sectionRef}>{children}</div>;
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

      <p className="is-size-6 has-text-weight-semibold mt-3">
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
        <a 
          href="/archive/github" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/github'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
      </p>
      {content}
    </div>
  );
};

const BookmarkSection = ({ section, onDeleteBookmark }) => {
  if (!section) return null;
  return (
    <div className="box">
      <p className="title is-5">
        <img src={bookmarksIcon} alt="Bookmarks" className="section-icon" />
        Bookmarks ({section.count ?? 0})
        <a 
          href="/archive/email_bookmarks" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/email_bookmarks'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
      </p>
      {section.items?.length ? (
        section.items.map((item) => (
          <div key={item.url} className="card mb-4">
            {item.imageUrl ? (
              <div className="card-image">
                <figure className="image">
                  <a href={item.url} target="_blank" rel="noreferrer">
                    <img src={item.imageUrl} alt={item.title || ''} />
                  </a>
                </figure>
              </div>
            ) : null}
            <div className="card-content">
              <div className="content">
                <a href={item.url} target="_blank" rel="noreferrer" className="has-text-weight-semibold is-size-6">
                  {item.title}
                </a>
                {item.excerpt ? <p className="is-size-7 mt-2">{item.excerpt}</p> : null}
                {item.commentText ? (
                  <p className="is-size-6 mt-2 has-text-grey-dark" style={{ fontStyle: 'italic' }}>
                    {item.commentText}
                  </p>
                ) : null}
                {item.occurredAt || item.sourceDomain ? (
                  <p className="is-size-7 has-text-grey mt-2" style={{ textAlign: 'right' }}>
                    {item.occurredAt ? new Date(item.occurredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''}
                    {item.sourceDomain ? ` · via ${item.sourceDomain}` : ''}
                    {item.id && onDeleteBookmark ? (
                      <button
                        className="delete is-small ml-2"
                        onClick={() => onDeleteBookmark(item.id)}
                        title="Delete bookmark"
                        aria-label="Delete bookmark"
                        style={{ verticalAlign: 'middle' }}
                      />
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="has-text-grey">No bookmarks</p>
      )}
    </div>
  );
};

const FinanceSection = ({ source }) => {
  if (!source) return null;

  const formatAmount = (amount) => {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    return `${sign}$${abs.toFixed(2)}`;
  };

  const getFinanceIcon = (institutionId) => {
    if (institutionId === 'amex') return amexIcon;
    if (institutionId === 'chime') return chimeIcon;
    if (institutionId === 'chase') return chaseIcon;
    return null;
  };

  const icon = getFinanceIcon(source.institutionId);

  return (
    <div className="box">
      <p className="title is-5">
        {icon && <img src={icon} alt={source.institutionName || 'Finance'} className="section-icon" />}
        {source.name}
        <a 
          href="/archive/finance" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/finance'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
      </p>
      
      <div className="mb-3">
        <p className="is-size-6">
          {source.count} transaction{source.count === 1 ? '' : 's'}
        </p>
        <p className="is-size-7 has-text-grey">
          Debits: ${source.debits.toFixed(2)}
          {source.credits > 0 && ` · Credits: -$${source.credits.toFixed(2)}`}
        </p>
      </div>

      {source.transactions?.length ? (
        <div className="content">
          <table className="table is-fullwidth is-size-7">
            <tbody>
              {source.transactions.map((tx, idx) => (
                <tr key={`${tx.reference || idx}`}>
                  <td className="has-text-grey" style={{ width: '80px', whiteSpace: 'nowrap' }}>
                    {tx.date}
                  </td>
                  <td>{tx.description}</td>
                  <td className="has-text-right has-text-weight-semibold" style={{ width: '100px', whiteSpace: 'nowrap' }}>
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
        <p className="has-text-grey">No transactions</p>
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
      {summary.topGenres?.length ? (
        <div className="mt-3 mb-3">
          <p className="is-size-6 has-text-weight-semibold mb-1">Top genres:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {summary.topGenres.map((g, idx) => {
              const label = encodeURIComponent(g.name);
              const value = encodeURIComponent(`${g.percent}%`);
              const labelBg = 'F3F4F6';
              const messageColor = '7F8790';
              const color = messageColor;
              const src = `https://img.shields.io/static/v1?label=${label}&message=${value}&color=${color}&style=social&labelColor=${labelBg}`;
              return <img key={g.name} src={src} alt={`${g.name}: ${g.percent}%`} />;
            })}
          </div>
        </div>
      ) : null}
      {summary.topArtists?.length ? (
        <div className="mt-3 mb-3">
          <p className="is-size-6 has-text-weight-semibold mb-1">Top artists:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {summary.topArtists.map((a, idx) => {
              const label = encodeURIComponent(a.name);
              const value = encodeURIComponent(`${a.count}`);
              const labelBg = 'F3F4F6';
              const messageColor = '7F8790';
              const color = messageColor;
              const src = `https://img.shields.io/static/v1?label=${label}&message=${value}&color=${color}&style=social&labelColor=${labelBg}`;
              return <img key={a.name} src={src} alt={`${a.name}: ${a.count}`} />;
            })}
          </div>
        </div>
      ) : null}
      {summary.topTracks?.length ? (
        <div className="mt-3 mb-3">
          <p className="is-size-6 has-text-weight-semibold mb-1">Most played:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {summary.topTracks.map((t, idx) => {
              const label = encodeURIComponent(t.name);
              const value = encodeURIComponent(`${t.count}`);
              const labelBg = 'F3F4F6';
              const messageColor = '7F8790';
              const color = messageColor;
              const src = `https://img.shields.io/static/v1?label=${label}&message=${value}&color=${color}&style=social&labelColor=${labelBg}`;
              return <img key={t.name} src={src} alt={`${t.name}: ${t.count}`} />;
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        {section.plays?.length ? (
          section.plays.map((play, idx) => (
            <div key={`${play.trackName}-${idx}`} className="media mb-4">
              {play.albumImage ? (
                <div className="media-left">
                  {play.url ? (
                    <a href={play.url} target="_blank" rel="noreferrer">
                      <figure className="image is-96x96">
                        <img src={play.albumImage} alt="" style={{ borderRadius: '6px' }} />
                      </figure>
                    </a>
                  ) : (
                    <figure className="image is-96x96">
                      <img src={play.albumImage} alt="" style={{ borderRadius: '6px' }} />
                    </figure>
                  )}
                </div>
              ) : null}
              <div className="media-content">
                    <p className="has-text-weight-semibold">
                      {play.uri ? (
                        <a href={play.uri} className="has-text-weight-semibold" target="_blank" rel="noreferrer">
                          {play.trackName}
                        </a>
                      ) : (
                        play.trackName
                      )}
                    </p>
                    {play.artists?.length ? (
                      <p className="is-size-7 has-text-grey">{play.artists.join(', ')}</p>
                    ) : null}
                    {play.genres?.length ? (
                      <div className="tags" style={{ marginTop: '4px', marginBottom: '4px' }}>
                        {play.genres.map((genre) => (
                          <span key={genre} className="tag is-light is-extra-small">{genre}</span>
                        ))}
                      </div>
                    ) : null}
                    {play.playedAt ? (
                      <p className="is-size-7 has-text-grey">
                        {new Date(play.playedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </p>
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
        <a 
          href="/archive/spotify" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/spotify'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
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
                <p className="is-size-7 has-text-grey">
                  {new Date(item.occurredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </p>
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
        <a 
          href="/archive/google_timeline" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/google_timeline'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
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
        <a 
          href="/archive/trello" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/trello'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
      </p>
      {content}
    </div>
  );
};

const GamingSection = ({ section, inCard = false }) => {
  if (!section) return null;
  const summary = section.summary ?? {};

  const snapshotLabel = 'Last 2 weeks of gameplay';

  const formatAchievementTime = (iso) => {
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
        {summary.gamesPlayed ?? 0} games
        {summary.totalDurationLabel ? ` · ${summary.totalDurationLabel}` : ''}
        {summary.achievementsUnlocked ? ` · ${summary.achievementsUnlocked} achievements` : ''}
      </p>

      {section.topGames?.length ? (
        <div className="mt-3">
          <p className="is-size-6 has-text-weight-semibold mb-2">{snapshotLabel}</p>
          {section.topGames.map((game) => (
            <div key={game.appid} className="media mb-4">
              {(game.logoUrl || game.iconUrl) ? (
                <div className="media-left">
                  {game.storeUrl ? (
                    <a href={game.storeUrl} target="_blank" rel="noreferrer">
                      <figure className="image is-48x48">
                        <img src={game.logoUrl || game.iconUrl} alt="" style={{ borderRadius: '4px' }} />
                      </figure>
                    </a>
                  ) : (
                    <figure className="image is-48x48">
                      <img src={game.logoUrl || game.iconUrl} alt="" style={{ borderRadius: '4px' }} />
                    </figure>
                  )}
                </div>
              ) : null}
              <div className="media-content">
                    <p className="has-text-weight-semibold">
                      {game.storeUrl ? (
                        <a href={game.storeUrl} target="_blank" rel="noreferrer">
                          {game.name}
                        </a>
                      ) : (
                        game.name
                      )}
                    </p>
                    <p className="is-size-7 has-text-grey">{game.durationLabel || `${game.minutes}m`}</p>
                  </div>
                </div>
            ))}
          </div>
        ) : (
          <p className="has-text-grey mt-2">No games played</p>
        )}

      {section.achievements?.length ? (
        <div className="mt-4">
          <p className="is-size-6 has-text-weight-semibold mb-2">Achievements unlocked:</p>
          {section.achievements.map((achievement, idx) => (
            <div key={`${achievement.appid}-${achievement.achievementName}-${idx}`} className="media mb-4">
              {achievement.achievementIconUrl ? (
                <div className="media-left">
                  <figure className="image is-64x64">
                    <img 
                      src={achievement.achievementIconUrl} 
                      alt={achievement.achievementName}
                      style={{ borderRadius: '4px', objectFit: 'cover' }}
                    />
                  </figure>
                </div>
              ) : (
                <div className="media-left">
                  <span style={{ fontSize: '2rem' }}>🏆</span>
                </div>
              )}
              <div className="media-content">
                <p className="has-text-weight-semibold">{achievement.achievementName}</p>
                <p className="is-size-7 has-text-grey">in {achievement.gameName}</p>
                {achievement.achievementDescription ? (
                  <p className="is-size-7 has-text-grey mt-1">{achievement.achievementDescription}</p>
                ) : null}
                {achievement.unlockedAt ? (
                  <p className="is-size-7 has-text-grey mt-1">{formatAchievementTime(achievement.unlockedAt)}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (inCard) return <div>{content}</div>;

  return (
    <div className="box">
      <p className="title is-5">
        <img src={steamIcon} alt="Steam" className="section-icon" />
        Steam
        <a 
          href="/archive/steam" 
          onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/steam'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="is-pulled-right is-size-7 has-text-grey"
          style={{ lineHeight: '2' }}
        >
          Archive →
        </a>
      </p>
      {content}
    </div>
  );
};

const JournalSection = ({ logs, goals, onToggleGoal }) => {
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
      <div className="column is-12-mobile is-6-desktop">
        <div className="box">
          <p className="title is-5">
            <img src={journalIcon} alt="Journal" className="section-icon" />
            Journal
            <a 
              href="/archive/journal" 
              onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/archive/journal'); window.dispatchEvent(new PopStateEvent('popstate')); }}
              className="is-pulled-right is-size-7 has-text-grey"
              style={{ lineHeight: '2' }}
            >
              Archive →
            </a>
          </p>
          {logs && logs.length > 0 ? (
            <div className="journal-logs">
              {logs.map((log) => (
                <div key={log.id} className="mb-3">
                  <p className="is-size-7 has-text-grey mb-1">{formatLogTime(log.createdAt)}</p>
                  <div className="journal-entry content" dangerouslySetInnerHTML={{ __html: marked(processMediaEmbeds(log.content || '')) }} />
                </div>
              ))}
            </div>
          ) : (
            <p className="has-text-grey">No journal entries for today</p>
          )}
        </div>
      </div>

      <div className="column is-12-mobile is-6-desktop">
        <div className="box">
          <p className="title is-5">
            <img src={goalsIcon} alt="Goals" className="section-icon" />
            Goals
          </p>
          {goals && goals.length > 0 ? (
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
          ) : (
            <p className="has-text-grey">No goals added for today</p>
          )}
        </div>
      </div>
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
    const isToday = offsetDays === 0;
    const cacheKey = `digest-${dateISO}`;

    const load = async () => {
      try {
        setState({ loading: true, error: null, vm: null });
        setLogs([]);
        setGoals([]);

        // Check cache for past days (not today)
        if (!isToday) {
          const cachedData = localStorage.getItem(cacheKey);
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData);
              if (!cancelled) {
                setState({ loading: false, error: null, vm: parsed.digestData });
                setLogs(parsed.logsData);
                setGoals(parsed.goalsData);
                if (onWeather) onWeather(parsed.digestData?.weather ?? null);
              }
              return;
            } catch (e) {
              // Invalid cache, continue to fetch
              localStorage.removeItem(cacheKey);
            }
          }
        }

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
          
          // Cache data for past days only
          if (!isToday) {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({
                digestData,
                logsData,
                goalsData,
              }));
            } catch (e) {
              // localStorage might be full, ignore
            }
          }
          
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
      
      // Invalidate cache for the current day when a goal is toggled
      const { start } = buildWindow(offsetDays);
      const dateISO = formatDateISO(start);
      const cacheKey = `digest-${dateISO}`;
      localStorage.removeItem(cacheKey);
    } catch (err) {
      console.error('Toggle goal error:', err);
    }
  };

  const handleDeleteBookmark = async (eventId) => {
    if (!window.confirm('Delete this bookmark?')) return;
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete bookmark');
      
      // Update the view model to remove the bookmark
      setState((prev) => {
        if (!prev.vm) return prev;
        
        const updatedSections = prev.vm.sections?.map((section) => {
          if (section.kind === 'bookmarks') {
            const updatedItems = section.items?.filter((item) => item.id !== eventId) ?? [];
            return {
              ...section,
              items: updatedItems,
              count: updatedItems.length,
            };
          }
          return section;
        });
        
        return {
          ...prev,
          vm: {
            ...prev.vm,
            sections: updatedSections,
          },
        };
      });
    } catch (err) {
      console.error('Delete bookmark error:', err);
      alert('Failed to delete bookmark');
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


  if (state.error) {
    return (
      <div className="box">
        <p className="subtitle is-6 has-text-danger">{state.error}</p>
      </div>
    );
  }

  // Show content even while loading for smooth transitions
  const { vm } = state;
  if (!vm) return null;

  return (
    <div key={offsetDays}>
      {/* Journal entry at the top if present */}
      <AnimatedSection delay={0}>
        <JournalSection logs={logs} goals={goals} onToggleGoal={handleToggleGoal} />
      </AnimatedSection>
      
      {/* removed Digest header box; weather is lifted to App */}
      {!vm.sections?.length && logs.length === 0 && goals.length === 0 && (
        <AnimatedSection delay={0.1}>
          <div className="box">
            <p className="has-text-grey mt-3">No events in this window.</p>
          </div>
        </AnimatedSection>
      )}

      {
        (() => {
          const github = vm.sections?.find((s) => s.kind === 'github') ?? null;
          const trello = vm.sections?.find((s) => s.kind === 'trello') ?? null;
          const music = vm.sections?.find((s) => s.kind === 'music') ?? null;
          const gaming = vm.sections?.find((s) => s.kind === 'gaming') ?? null;
          const timeline = vm.sections?.find((s) => s.kind === 'timeline') ?? null;
          const finance = vm.sections?.find((s) => s.kind === 'finance') ?? null;
          const other = (vm.sections || []).filter((s) => !['github', 'trello', 'music', 'gaming', 'timeline', 'finance'].includes(s.kind));

          let delayCounter = 0.1;

          return (
            <>
              <AnimatedSection delay={delayCounter}>
                <div className="columns is-multiline">
                  <div className="column is-12-mobile is-6-desktop">
                    {github ? (
                      <GithubSection section={github} />
                    ) : (
                      <div className="box">
                        <p className="title is-5">
                          <img src={githubIcon} alt="GitHub" className="section-icon" />
                          GitHub
                        </p>
                        <p className="has-text-grey">No GitHub activity</p>
                      </div>
                    )}
                  </div>
                  <div className="column is-12-mobile is-6-desktop">
                    {trello ? (
                      <TrelloSection section={trello} />
                    ) : (
                      <div className="box">
                        <p className="title is-5">
                          <img src={trelloIcon} alt="Trello" className="section-icon" />
                          Trello
                        </p>
                        <p className="has-text-grey">No Trello activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={delayCounter + 0.1}>
                <div className="columns is-multiline">
                  <div className="column is-12-mobile is-6-desktop">
                    {music ? (
                      <MusicSection section={music} />
                    ) : (
                      <div className="box">
                        <p className="title is-5">
                          <img src={spotifyIcon} alt="Spotify" className="section-icon" />
                          Spotify
                        </p>
                        <p className="has-text-grey">No play activity</p>
                      </div>
                    )}
                  </div>
                  <div className="column is-12-mobile is-6-desktop">
                    {gaming ? (
                      <GamingSection section={gaming} />
                    ) : (
                      <div className="box">
                        <p className="title is-5">
                          <img src={steamIcon} alt="Steam" className="section-icon" />
                          Steam
                        </p>
                        <p className="has-text-grey">No gaming activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={delayCounter + 0.2}>
                <div className="columns is-multiline">
                  <div className="column is-12-mobile is-6-desktop">
                    {timeline ? (
                      <TimelineSection section={timeline} />
                    ) : (
                      <div className="box">
                        <p className="title is-5">
                          <img src={timelineIcon} alt="Timeline" className="section-icon" />
                          Timeline
                        </p>
                        <p className="has-text-grey">No timeline events</p>
                      </div>
                    )}
                  </div>
                  <div className="column is-12-mobile is-6-desktop">
                    {(() => {
                      const bookmarks = vm.sections?.find((s) => s.kind === 'bookmarks') ?? null;
                      return bookmarks ? (
                        <BookmarkSection section={bookmarks} onDeleteBookmark={handleDeleteBookmark} />
                      ) : (
                        <div className="box">
                          <p className="title is-5">
                            <img src={bookmarksIcon} alt="Bookmarks" className="section-icon" />
                            Bookmarks
                          </p>
                          <p className="has-text-grey">No bookmarks saved</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </AnimatedSection>

              {/* Finance Sources - one section per source */}
              {finance?.sources?.length > 0 && (
                <AnimatedSection delay={delayCounter + 0.3}>
                  <div className="columns is-multiline">
                    {finance.sources.map((source, idx) => (
                      <div key={source.sourceId || idx} className="column is-12-mobile is-6-desktop">
                        <FinanceSection source={source} />
                      </div>
                    ))}
                  </div>
                </AnimatedSection>
              )}
            </>
          );
        })()
      }
    </div>
  );
}
