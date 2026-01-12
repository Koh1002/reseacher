// =============================================
// Multi-Agent Analysis Council - Core Types
// =============================================

/**
 * Confidence level for analysis results
 */
export type Confidence = 'low' | 'mid' | 'high';

/**
 * Chart types for visualization
 */
export type ChartType = 'bar' | 'line' | 'table' | 'pie' | 'doughnut';

/**
 * Chart specification for UI rendering
 * Only contains aggregated data, never raw rows
 */
export interface ChartSpec {
  type: ChartType;
  title?: string;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
  }[];
}

/**
 * Metric value in an evidence card
 */
export interface Metric {
  name: string;
  value: number | string;
  unit?: string;
  delta?: number; // Change from baseline, if applicable
}

/**
 * Timeframe for analysis
 */
export interface Timeframe {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

/**
 * EvidenceCard - The core abstraction for sharing analysis results
 * IMPORTANT: Raw data is NEVER shared. Only aggregated/summarized results.
 */
export interface EvidenceCard {
  id: string;
  author_agent: string;
  claim: string;              // Main observation/assertion
  method: string;             // How it was verified
  query_fingerprint: string;  // Hash/summary of query, NOT full SQL
  metrics: Metric[];
  segment_def: string;        // Definition of analyzed segment
  timeframe: Timeframe;
  chart_spec?: ChartSpec;     // Optional visualization (aggregated only)
  confidence: Confidence;
  caveats: string[];          // Limitations and caveats
  created_at: string;         // ISO timestamp
}

/**
 * Issue - A point of analysis/discussion
 */
export interface Issue {
  id: string;
  title: string;
  description: string;
  why_it_matters: string;
  hypotheses: string[];
  required_cards: string[];   // Types of evidence needed
  status: 'open' | 'in_progress' | 'resolved';
  assigned_to?: string;       // Agent ID
  resolution?: string;        // Final conclusion
}

/**
 * Message type in the council discussion
 */
export type MessageType =
  | 'proposal'    // New idea/hypothesis
  | 'question'    // Asking for clarification
  | 'critique'    // Challenging a claim
  | 'support'     // Supporting a claim
  | 'decision'    // Final decision on an issue
  | 'summary'     // Summary of discussion
  | 'system';     // System message

/**
 * Message - A single entry in the council discussion log
 */
export interface Message {
  id: string;
  ts: string;           // ISO timestamp
  speaker: string;      // Agent ID or 'system'
  type: MessageType;
  ref_cards?: string[]; // Referenced EvidenceCard IDs
  ref_issues?: string[];// Referenced Issue IDs
  content: string;
}

/**
 * Agent role types
 */
export type AgentRole =
  | 'chair'
  | 'growth_analyst'
  | 'segment_analyst'
  | 'basket_analyst'
  | 'seasonality_analyst'
  | 'price_analyst';

/**
 * Agent status
 */
export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'analyzing'
  | 'discussing'
  | 'waiting'
  | 'done'
  | 'error';

/**
 * Agent definition
 */
export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  persona: string;        // Description of analysis perspective
  status: AgentStatus;
  progress: number;       // 0-100
  current_task?: string;
  cards_submitted: number;
  messages_sent: number;
}

/**
 * Workflow states
 */
export type WorkflowState =
  | 'IDLE'
  | 'PLANNING'
  | 'ISSUE_DECOMPOSE'
  | 'ANALYZING'
  | 'COUNCIL'
  | 'ITERATE'
  | 'FINALIZE'
  | 'DONE'
  | 'ERROR';

/**
 * Final analysis report
 */
export interface AnalysisReport {
  analysis_story: string;   // Narrative format
  minutes: {                // Meeting minutes
    summary: string;
    key_findings: string[];
    discussion_points: {
      issue_id: string;
      issue_title: string;
      messages: Message[];
      conclusion: string;
    }[];
    participants: string[];
    duration_seconds: number;
  };
  appendix: {
    issues: Issue[];
    cards: EvidenceCard[];
  };
  generated_at: string;
}

/**
 * Council session
 */
export interface CouncilSession {
  id: string;
  topic: string;          // User's analysis request
  state: WorkflowState;
  round: number;
  max_rounds: number;
  agents: Agent[];
  issues: Issue[];
  cards: EvidenceCard[];
  messages: Message[];
  report?: AnalysisReport;
  started_at: string;
  ended_at?: string;
}

/**
 * Mode for LLM interaction
 */
export type LLMMode = 'DEMO' | 'DEV';

/**
 * App configuration
 */
export interface AppConfig {
  mode: LLMMode;
  max_rounds: number;
  animation_enabled: boolean;
  animation_speed: number; // ms between messages
}
