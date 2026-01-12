// =============================================
// Agent Protocol - Interface Definition
// =============================================

import type {
  Agent,
  EvidenceCard,
  Issue,
  Message,
  MessageType,
} from '../types';

/**
 * Analysis context passed to agents
 */
export interface AnalysisContext {
  topic: string;
  round: number;
  existingIssues: Issue[];
  existingCards: EvidenceCard[];
  existingMessages: Message[];
}

/**
 * Agent response containing actions to take
 */
export interface AgentResponse {
  issues?: Issue[];
  cards?: EvidenceCard[];
  messages?: Omit<Message, 'id' | 'ts'>[];
}

/**
 * Agent protocol interface
 * All agents (Chair, Analysts) implement this interface
 */
export interface AgentProtocol {
  /** Agent's identity */
  agent: Agent;

  /** Planning phase - Chair only */
  plan?(context: AnalysisContext): Promise<AgentResponse>;

  /** Decompose topic into issues */
  decomposeIssues?(context: AnalysisContext): Promise<Issue[]>;

  /** Perform analysis and generate evidence cards */
  analyze?(context: AnalysisContext, assignedIssue: Issue): Promise<EvidenceCard[]>;

  /** Participate in council discussion */
  discuss?(context: AnalysisContext): Promise<Omit<Message, 'id' | 'ts'>[]>;

  /** Generate final report - Chair only */
  finalize?(context: AnalysisContext): Promise<{
    analysis_story: string;
    key_findings: string[];
  }>;
}

/**
 * Create a discussion message
 */
export function createMessage(
  speaker: string,
  type: MessageType,
  content: string,
  refCards?: string[],
  refIssues?: string[]
): Omit<Message, 'id' | 'ts'> {
  return {
    speaker,
    type,
    content,
    ref_cards: refCards,
    ref_issues: refIssues,
  };
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
