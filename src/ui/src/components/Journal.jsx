import React, { useEffect, useState, useRef } from 'react';

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return iso;
  }
};

export default function Journal({ date, dateLabel }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Goals state
  const [goals, setGoals] = useState([]);
  const [newGoalText, setNewGoalText] = useState('');

  // Journal logs state
  const [logs, setLogs] = useState([]);
  const [newLogContent, setNewLogContent] = useState('');
  const [editingLogId, setEditingLogId] = useState(null);
  const [editingLogContent, setEditingLogContent] = useState('');

  // Load data when date changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch goals and logs in parallel
        const [goalsRes, logsRes] = await Promise.all([
          fetch(`/api/goals?date=${date}`, { credentials: 'include' }),
          fetch(`/api/logs?date=${date}`, { credentials: 'include' }),
        ]);

        let goalsData = [];
        if (goalsRes.ok) {
          const gd = await goalsRes.json();
          goalsData = gd.goals || [];
        }

        let logsData = [];
        if (logsRes.ok) {
          const ld = await logsRes.json();
          logsData = ld.logs || [];
        }

        if (!cancelled) {
          setGoals(goalsData);
          setLogs(logsData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Goal actions
  const addGoal = async () => {
    if (!newGoalText.trim()) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, text: newGoalText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add goal');
      const data = await res.json();
      setGoals((prev) => [...prev, data.goal]);
      setNewGoalText('');
    } catch (err) {
      console.error('Add goal error:', err);
    }
  };

  const toggleGoal = async (goalId, completed) => {
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

  const deleteGoal = async (goalId) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete goal');
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch (err) {
      console.error('Delete goal error:', err);
    }
  };

  const handleNewGoalKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGoal();
    }
  };

  // Log actions
  const addLog = async () => {
    if (!newLogContent.trim()) return;
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content: newLogContent.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add log');
      const data = await res.json();
      setLogs((prev) => [...prev, data.log]);
      setNewLogContent('');
    } catch (err) {
      console.error('Add log error:', err);
    }
  };

  const startEditLog = (log) => {
    setEditingLogId(log.id);
    setEditingLogContent(log.content);
  };

  const cancelEditLog = () => {
    setEditingLogId(null);
    setEditingLogContent('');
  };

  const saveEditLog = async () => {
    if (!editingLogContent.trim()) return;
    try {
      const res = await fetch(`/api/logs/${editingLogId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingLogContent.trim() }),
      });
      if (!res.ok) throw new Error('Failed to update log');
      const data = await res.json();
      setLogs((prev) => prev.map((l) => (l.id === editingLogId ? data.log : l)));
      setEditingLogId(null);
      setEditingLogContent('');
    } catch (err) {
      console.error('Update log error:', err);
    }
  };

  const deleteLog = async (logId) => {
    if (!window.confirm('Delete this log entry?')) return;
    try {
      const res = await fetch(`/api/logs/${logId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete log');
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch (err) {
      console.error('Delete log error:', err);
    }
  };

  const handleNewLogKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addLog();
    }
  };

  if (loading) {
    return (
      <div className="box">
        <p className="subtitle is-6">Loading journal…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="box">
        <p className="subtitle is-6 has-text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="box">
        <h2 className="title is-4 mb-4">Journal — {dateLabel}</h2>

        {/* Goals section */}
        <div className="field mb-4">
          <label className="label is-small">Goals for the day</label>
          <div className="goals-list">
            {goals.length === 0 && (
              <p className="has-text-grey is-size-7 mb-2">No goals yet. Add one below.</p>
            )}
            {goals.map((goal) => (
              <div key={goal.id} className="is-flex is-align-items-center mb-2 goal-item">
                <label className="checkbox is-flex is-align-items-center" style={{ flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={goal.completed}
                    onChange={() => toggleGoal(goal.id, goal.completed)}
                    className="mr-2"
                  />
                  <span className={goal.completed ? 'has-text-grey-light' : ''} style={goal.completed ? { textDecoration: 'line-through' } : {}}>
                    {goal.text}
                  </span>
                </label>
                <button
                  className="button is-small is-light is-danger ml-2"
                  onClick={() => deleteGoal(goal.id)}
                  title="Delete goal"
                >
                  <span className="icon is-small">
                    <i className="fa-solid fa-trash" />
                  </span>
                </button>
              </div>
            ))}
            <div className="is-flex is-align-items-center mt-2">
              <input
                className="input is-small"
                type="text"
                placeholder="Add a new goal…"
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                onKeyDown={handleNewGoalKeyDown}
                style={{ flex: 1 }}
              />
              <button
                className="button is-small is-success ml-2"
                onClick={addGoal}
                disabled={!newGoalText.trim()}
              >
                <span className="icon is-small">
                  <i className="fa-solid fa-plus" />
                </span>
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>

        <hr />

        {/* Journal Logs section */}
        <div className="field">
          <label className="label is-small">Journal Log</label>

          {/* Existing logs (oldest first) */}
          {logs.length === 0 && (
            <p className="has-text-grey is-size-7 mb-3">No log entries yet. Add one below.</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="box mb-3" style={{ backgroundColor: '#fefcf9', borderLeft: '3px solid #e8b963' }}>
              {editingLogId === log.id ? (
                <div>
                  <textarea
                    className="textarea is-small mb-2"
                    rows={4}
                    value={editingLogContent}
                    onChange={(e) => setEditingLogContent(e.target.value)}
                    autoFocus
                  />
                  <div className="buttons is-right">
                    <button className="button is-small is-light" onClick={cancelEditLog}>Cancel</button>
                    <button className="button is-small is-success" onClick={saveEditLog}>Save</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="is-flex is-align-items-start is-justify-content-space-between">
                    <p className="is-size-7 has-text-grey mb-2">{formatTime(log.createdAt)}</p>
                    <div className="buttons">
                      <button
                        className="button is-small is-light"
                        onClick={() => startEditLog(log)}
                        title="Edit"
                      >
                        <span className="icon is-small">
                          <i className="fa-solid fa-pen" />
                        </span>
                      </button>
                      <button
                        className="button is-small is-light is-danger"
                        onClick={() => deleteLog(log.id)}
                        title="Delete"
                      >
                        <span className="icon is-small">
                          <i className="fa-solid fa-trash" />
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="content" style={{ whiteSpace: 'pre-wrap' }}>{log.content}</div>
                </div>
              )}
            </div>
          ))}

          {/* New log entry */}
          <div className="mt-3">
            <textarea
              className="textarea"
              rows={4}
              placeholder="Add a new log entry… (Ctrl/Cmd+Enter to submit)"
              value={newLogContent}
              onChange={(e) => setNewLogContent(e.target.value)}
              onKeyDown={handleNewLogKeyDown}
            />
            <div className="is-flex is-justify-content-space-between is-align-items-center mt-2">
              <p className="help has-text-grey">Press Ctrl+Enter (Cmd+Enter on Mac) to add, or click the button</p>
              <button
                className="button is-small is-success"
                onClick={addLog}
                disabled={!newLogContent.trim()}
              >
                <span className="icon is-small">
                  <i className="fa-solid fa-plus" />
                </span>
                <span>Add Log Entry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
