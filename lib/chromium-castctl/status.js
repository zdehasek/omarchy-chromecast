'use strict';

const { CAST_START_STATUS_GRACE_MS, STATUS_SINK_WAIT_MS } = require('./constants');
const { discardStateBrowser } = require('./chromium');
const { restoreDisplay } = require('./display');
const { withCastClient } = require('./cast');
const { readState, freshUiState } = require('./state');
const { activeSinks } = require('./sinks');

function recentlyStartedSink(state, now = Date.now()) {
  if (!state || typeof state.lastActiveSink !== 'string' || !state.lastActiveSink) return null;
  const startedAt = Date.parse(state.castStartedAt || '');
  const ageMs = now - startedAt;
  return Number.isFinite(startedAt) && ageMs >= 0 && ageMs <= CAST_START_STATUS_GRACE_MS
    ? state.lastActiveSink
    : null;
}

async function getStatus(paths, options = {}) {
  const busy = options.ignoreUiState ? null : freshUiState(paths);
  if (busy) return { busy, activeSink: null, sinks: [], browser: false, stale: false };

  return withCastClient(paths, {
    ...options,
    launch: false,
    waitMs: options.waitMs ?? STATUS_SINK_WAIT_MS,
  }, async ({ browser, sinks }) => {
    if (!browser) {
      restoreDisplay(paths, options);
      return { activeSink: null, sinks: [], browser: false, stale: false };
    }
    const active = activeSinks(sinks);
    const activeSink = active[0] ? active[0].name : recentlyStartedSink(readState(paths));
    return {
      activeSink,
      sinks,
      browser: true,
      stale: false,
    };
  }).catch(async (error) => {
    const state = readState(paths);
    if (state) await discardStateBrowser(paths, state, options);
    restoreDisplay(paths, options);
    return { activeSink: null, sinks: [], browser: false, stale: true, error };
  });
}

module.exports = { recentlyStartedSink, getStatus };
