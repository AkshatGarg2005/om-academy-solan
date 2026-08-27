import React from 'react';

// A chunk that fails to fetch throws during render, and with lazy routes there
// is nothing above to catch it — the page goes blank. The usual cause is a tab
// left open across a deploy: the stale index.html asks for a chunk hash the host
// no longer serves. Reloading picks up the new index.html and fixes it.
function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;
  return /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i
    .test(error.message || '');
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const staleBuild = isChunkLoadError(error);
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state-icon">{staleBuild ? '🔄' : '⚠️'}</div>
          <h3>{staleBuild ? 'A newer version is available' : 'Something went wrong'}</h3>
          <p>
            {staleBuild
              ? 'This page was updated while you had it open. Reload to continue.'
              : 'Reload the page to try again. If it keeps happening, let us know.'}
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
