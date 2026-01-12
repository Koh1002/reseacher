// =============================================
// Council State Management (Zustand)
// =============================================

import { create } from 'zustand';
import type {
  Agent,
  AgentRole,
  AgentStatus,
  AnalysisReport,
  AppConfig,
  CouncilSession,
  EvidenceCard,
  Issue,
  LLMMode,
  Message,
  WorkflowState,
} from '../types';

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

// Default agent configurations
const DEFAULT_AGENTS: Omit<Agent, 'id' | 'status' | 'progress' | 'cards_submitted' | 'messages_sent'>[] = [
  {
    name: 'Chair',
    role: 'chair',
    persona: 'I orchestrate the analysis council, decompose the topic into issues, assign analysts, and synthesize findings into a coherent narrative.',
  },
  {
    name: 'Growth Analyst',
    role: 'growth_analyst',
    persona: 'I focus on revenue trends, sales velocity, and growth metrics. I look for patterns in transaction frequency and value.',
  },
  {
    name: 'Segment Analyst',
    role: 'segment_analyst',
    persona: 'I analyze customer segments based on purchasing behavior, identifying distinct groups and their characteristics.',
  },
  {
    name: 'Basket Analyst',
    role: 'basket_analyst',
    persona: 'I examine what products are purchased together, basket sizes, and cross-category buying patterns.',
  },
  {
    name: 'Seasonality Analyst',
    role: 'seasonality_analyst',
    persona: 'I detect time-based patterns: day-of-week effects, monthly trends, seasonal spikes, and event-driven behaviors.',
  },
];

interface CouncilState {
  // Configuration
  config: AppConfig;
  setConfig: (config: Partial<AppConfig>) => void;

  // Session
  session: CouncilSession | null;
  isDataLoaded: boolean;
  setDataLoaded: (loaded: boolean) => void;

  // Session actions
  startSession: (topic: string) => void;
  endSession: () => void;
  setWorkflowState: (state: WorkflowState) => void;
  incrementRound: () => void;

  // Agent actions
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  setAgentProgress: (agentId: string, progress: number) => void;

  // Issue actions
  addIssue: (issue: Issue) => void;
  updateIssue: (issueId: string, updates: Partial<Issue>) => void;

  // Evidence card actions
  addCard: (card: EvidenceCard) => void;
  updateCard: (cardId: string, updates: Partial<EvidenceCard>) => void;

  // Message actions
  addMessage: (message: Omit<Message, 'id' | 'ts'>) => void;

  // Report actions
  setReport: (report: AnalysisReport) => void;

  // Selectors
  getAgentById: (id: string) => Agent | undefined;
  getAgentByRole: (role: AgentRole) => Agent | undefined;
  getCardById: (id: string) => EvidenceCard | undefined;
  getIssueById: (id: string) => Issue | undefined;
  getCardsByAgent: (agentId: string) => EvidenceCard[];
  getMessagesByAgent: (agentId: string) => Message[];
  getOpenIssues: () => Issue[];
}

export const useCouncilStore = create<CouncilState>((set, get) => ({
  // Initial configuration
  config: {
    mode: 'DEMO' as LLMMode,
    max_rounds: 2,
    animation_enabled: true,
    animation_speed: 500,
  },

  setConfig: (updates) =>
    set((state) => ({
      config: { ...state.config, ...updates },
    })),

  // Session state
  session: null,
  isDataLoaded: false,

  setDataLoaded: (loaded) => set({ isDataLoaded: loaded }),

  startSession: (topic) => {
    const agents: Agent[] = DEFAULT_AGENTS.map((a) => ({
      ...a,
      id: generateId(),
      status: 'idle' as AgentStatus,
      progress: 0,
      cards_submitted: 0,
      messages_sent: 0,
    }));

    const session: CouncilSession = {
      id: generateId(),
      topic,
      state: 'IDLE',
      round: 0,
      max_rounds: get().config.max_rounds,
      agents,
      issues: [],
      cards: [],
      messages: [],
      started_at: new Date().toISOString(),
    };

    set({ session });
  },

  endSession: () =>
    set((state) => ({
      session: state.session
        ? { ...state.session, ended_at: new Date().toISOString() }
        : null,
    })),

  setWorkflowState: (workflowState) =>
    set((state) => ({
      session: state.session ? { ...state.session, state: workflowState } : null,
    })),

  incrementRound: () =>
    set((state) => ({
      session: state.session
        ? { ...state.session, round: state.session.round + 1 }
        : null,
    })),

  // Agent actions
  updateAgent: (agentId, updates) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            agents: state.session.agents.map((a) =>
              a.id === agentId ? { ...a, ...updates } : a
            ),
          }
        : null,
    })),

  setAgentStatus: (agentId, status) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            agents: state.session.agents.map((a) =>
              a.id === agentId ? { ...a, status } : a
            ),
          }
        : null,
    })),

  setAgentProgress: (agentId, progress) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            agents: state.session.agents.map((a) =>
              a.id === agentId ? { ...a, progress } : a
            ),
          }
        : null,
    })),

  // Issue actions
  addIssue: (issue) =>
    set((state) => ({
      session: state.session
        ? { ...state.session, issues: [...state.session.issues, issue] }
        : null,
    })),

  updateIssue: (issueId, updates) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            issues: state.session.issues.map((i) =>
              i.id === issueId ? { ...i, ...updates } : i
            ),
          }
        : null,
    })),

  // Evidence card actions
  addCard: (card) =>
    set((state) => {
      if (!state.session) return state;
      return {
        session: {
          ...state.session,
          cards: [...state.session.cards, card],
          agents: state.session.agents.map((a) =>
            a.id === card.author_agent
              ? { ...a, cards_submitted: a.cards_submitted + 1 }
              : a
          ),
        },
      };
    }),

  updateCard: (cardId, updates) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            cards: state.session.cards.map((c) =>
              c.id === cardId ? { ...c, ...updates } : c
            ),
          }
        : null,
    })),

  // Message actions
  addMessage: (messageData) =>
    set((state) => {
      if (!state.session) return state;
      const message: Message = {
        ...messageData,
        id: generateId(),
        ts: new Date().toISOString(),
      };
      return {
        session: {
          ...state.session,
          messages: [...state.session.messages, message],
          agents: state.session.agents.map((a) =>
            a.id === messageData.speaker
              ? { ...a, messages_sent: a.messages_sent + 1 }
              : a
          ),
        },
      };
    }),

  // Report actions
  setReport: (report) =>
    set((state) => ({
      session: state.session ? { ...state.session, report } : null,
    })),

  // Selectors
  getAgentById: (id) => get().session?.agents.find((a) => a.id === id),
  getAgentByRole: (role) => get().session?.agents.find((a) => a.role === role),
  getCardById: (id) => get().session?.cards.find((c) => c.id === id),
  getIssueById: (id) => get().session?.issues.find((i) => i.id === id),
  getCardsByAgent: (agentId) =>
    get().session?.cards.filter((c) => c.author_agent === agentId) ?? [],
  getMessagesByAgent: (agentId) =>
    get().session?.messages.filter((m) => m.speaker === agentId) ?? [],
  getOpenIssues: () =>
    get().session?.issues.filter((i) => i.status !== 'resolved') ?? [],
}));
