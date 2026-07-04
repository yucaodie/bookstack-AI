export function createStructuredLogger({ sink = [] } = {}) {
  function push(level, event, context = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      context,
    };
    if (typeof sink.push === 'function') {
      sink.push(entry);
    }
    return entry;
  }

  return {
    info(event, context) {
      return push('info', event, context);
    },
    warn(event, context) {
      return push('warn', event, context);
    },
    error(event, context) {
      return push('error', event, context);
    },
    entries: sink,
  };
}
