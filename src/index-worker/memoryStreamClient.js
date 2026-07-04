function clone(value) {
  return structuredClone(value);
}

export function createMemoryStreamClient(streams) {
  const store = new Map();
  for (const streamName of Object.values(streams)) {
    store.set(streamName, []);
  }

  return {
    append(stream, message) {
      const list = store.get(stream);
      if (!list) {
        throw new Error(`Unknown stream: ${stream}`);
      }
      list.push(clone(message));
      return message.id;
    },
    read(stream) {
      const list = store.get(stream);
      if (!list) {
        throw new Error(`Unknown stream: ${stream}`);
      }
      return list.map((item) => clone(item));
    },
    shift(stream) {
      const list = store.get(stream);
      if (!list) {
        throw new Error(`Unknown stream: ${stream}`);
      }
      const item = list.shift();
      return item ? clone(item) : null;
    },
  };
}
