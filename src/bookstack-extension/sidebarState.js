const DEFAULT_SIDEBAR_KEY = 'bookstack-ai.sidebar';
const DEFAULT_CONVERSATION_KEY = 'bookstack-ai.conversation';

function readJson(storage, key, fallback) {
  const raw = storage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function createSidebarStateController({
  storage,
  sidebarKey = DEFAULT_SIDEBAR_KEY,
  conversationKey = DEFAULT_CONVERSATION_KEY,
  onStateChange = () => {},
} = {}) {
  if (!storage?.getItem || !storage?.setItem) {
    throw new Error('storage with getItem/setItem is required.');
  }

  const persistedSidebarState = readJson(storage, sidebarKey, { collapsed: false });
  let collapsed = Boolean(persistedSidebarState.collapsed);
  let conversation = readJson(storage, conversationKey, null);

  function persistSidebar() {
    storage.setItem(sidebarKey, JSON.stringify({ collapsed }));
    onStateChange({ collapsed, conversation });
  }

  return {
    isCollapsed() {
      return collapsed;
    },

    collapse() {
      collapsed = true;
      persistSidebar();
    },

    expand() {
      collapsed = false;
      persistSidebar();
    },

    toggle() {
      collapsed = !collapsed;
      persistSidebar();
      return collapsed;
    },

    getConversation() {
      return conversation;
    },

    setConversation(nextConversation) {
      conversation = nextConversation;
      storage.setItem(conversationKey, JSON.stringify(nextConversation));
      onStateChange({ collapsed, conversation });
    },
  };
}
