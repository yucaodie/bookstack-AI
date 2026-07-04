import { createBookStackAiExtension } from './bookstack-extension/bookstackAiExtension.js';

const storage = window.localStorage;
const sidebarElement = document.querySelector('#sidebar');
const toggleButton = document.querySelector('#toggle-sidebar');
const globalEntryButton = document.querySelector('#global-entry');
const askButton = document.querySelector('#ask-button');
const pageEventButton = document.querySelector('#page-event-button');
const questionInput = document.querySelector('#question');
const answerText = document.querySelector('#answer-text');
const citationsContainer = document.querySelector('#citations');
const scopeLine = document.querySelector('#scope-line');
const statusLine = document.querySelector('#status-line');
const scopeButtons = [...document.querySelectorAll('[data-scope]')];

let activeScope = 'page';

const scopeDescription = {
  page: '将基于当前页和当前用户权限检索',
  book: '将基于当前书和当前用户权限检索',
  workspace: '将基于当前用户可访问范围检索',
};

const mockGateway = {
  async query(payload) {
    await new Promise((resolve) => setTimeout(resolve, 280));
    return {
      request_id: `demo-${Date.now()}`,
      answer: `已按 ${payload.scope_mode} 范围处理问题“${payload.question}”。当前演示使用 mock AI Gateway，真实接入后这里会显示 SSE 增量结果。`,
      citations: [
        {
          page_id: payload.context_page_id ?? 101,
          page_title: '认证配置',
          path: '平台手册/认证/认证配置',
          anchor: payload.scope_mode === 'workspace' ? 'global-auth' : 'oidc',
          snippet: '系统支持 OIDC 与 SAML 作为企业单点登录方案。',
        },
      ],
    };
  },
  async sendIndexEvent(payload) {
    await new Promise((resolve) => setTimeout(resolve, 160));
    return {
      accepted: true,
      event_id: payload.event_id,
    };
  },
  async healthCheck() {
    return { status: 'ok' };
  },
};

const extension = createBookStackAiExtension({
  gateway: mockGateway,
  storage,
  tenantId: 'tenant-demo',
  userId: 'user-demo',
  currentPageId: 101,
  currentBookId: 10,
  accessibleScope: {
    shelves: [1],
    books: [10, 11],
    chapters: [1001],
    pages: [101, 102, 103],
  },
  onStateChange({ collapsed, conversation }) {
    sidebarElement.classList.toggle('collapsed', collapsed);
    if (conversation?.question) {
      statusLine.textContent = `最近一次提问：${conversation.question}`;
    }
  },
});

function updateScope(nextScope) {
  activeScope = nextScope;
  for (const button of scopeButtons) {
    button.classList.toggle('active', button.dataset.scope === nextScope);
  }
  scopeLine.textContent = scopeDescription[nextScope];
}

function renderCitations(citations) {
  citationsContainer.replaceChildren();
  for (const citation of citations) {
    const node = document.createElement('div');
    node.className = 'citation';
    node.textContent = `${citation.path} · #${citation.anchor} · ${citation.snippet}`;
    citationsContainer.appendChild(node);
  }
}

toggleButton.addEventListener('click', () => {
  extension.sidebar.toggle();
});

globalEntryButton.addEventListener('click', () => {
  if (extension.sidebar.isCollapsed()) {
    extension.sidebar.expand();
  }
  statusLine.textContent = '已从全局顶部次入口打开问答面板';
});

for (const button of scopeButtons) {
  button.addEventListener('click', () => updateScope(button.dataset.scope));
}

askButton.addEventListener('click', async () => {
  askButton.disabled = true;
  answerText.textContent = '正在生成回答...';
  citationsContainer.replaceChildren();

  try {
    const response = await extension.askQuestion({
      question: questionInput.value.trim(),
      mode: activeScope,
    });
    answerText.textContent = response.answer;
    renderCitations(response.citations ?? []);
    statusLine.textContent = `请求已完成，请求号：${response.request_id}`;
  } finally {
    askButton.disabled = false;
  }
});

pageEventButton.addEventListener('click', async () => {
  pageEventButton.disabled = true;
  const result = await extension.emitPageEvent('page.updated', {
    page_id: 101,
    actor_id: 'user-demo',
  });
  statusLine.textContent = `页面更新事件已发送：${result.event_id}`;
  pageEventButton.disabled = false;
});

updateScope(activeScope);
sidebarElement.classList.toggle('collapsed', extension.sidebar.isCollapsed());

const savedConversation = extension.sidebar.getConversation();
if (savedConversation?.question) {
  statusLine.textContent = `最近一次提问：${savedConversation.question}`;
  questionInput.value = savedConversation.question;
}
