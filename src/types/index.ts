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
  | 'DATA_SCAN'       // BYD mode: scanning uploaded data
  | 'PLANNING'
  | 'ISSUE_DECOMPOSE'
  | 'ANALYZING'
  | 'COUNCIL'
  | 'QUALITY_CHECK'   // Chair evaluates analysis quality
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
  topic: string;          // User's analysis request (can change per iteration)
  originalTopic: string;  // Original user request
  state: WorkflowState;
  round: number;
  max_rounds: number;
  iteration: number;      // Current iteration (1-5)
  maxIterations: number;  // Always 5
  minIterations: number;  // Always 3
  iterationHistory: IterationRound[];
  currentEvaluation?: QualityEvaluation;
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

// ============ BYD Mode Types ============

/**
 * Data mode selection
 */
export type DataMode = 'DEMO' | 'BYD';

/**
 * Detected column information
 */
export interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'date' | 'unknown';
  sampleValues: string[];
  nullCount: number;
  uniqueCount: number;
  // Inferred purpose
  inferredRole?: 'date' | 'member_id' | 'store' | 'category' | 'product' | 'quantity' | 'amount' | 'transaction_id' | 'other';
}

/**
 * Detected data schema from uploaded CSV
 */
export interface DataSchema {
  tableName: string;
  rowCount: number;
  columns: ColumnInfo[];
  summary: string; // Natural language summary of the data
  dataType: 'supermarket' | 'drugstore' | 'retail' | 'unknown';
  // Column mappings for analysis queries
  columnMappings: {
    dateColumn?: string;
    memberIdColumn?: string;
    storeColumn?: string;
    categoryColumn?: string;
    productColumn?: string;
    quantityColumn?: string;
    amountColumn?: string;
    transactionIdColumn?: string;
  };
}

// ============ Iteration & Quality Evaluation Types ============

/**
 * Quality scores for analysis evaluation
 */
export interface QualityScores {
  specificity: number;     // 1-5: How specific and actionable are the findings
  novelty: number;         // 1-5: How new/non-obvious are the insights
  actionClarity: number;   // 1-5: How clear are the next action recommendations
}

/**
 * Quality evaluation result from Chair
 */
export interface QualityEvaluation {
  scores: QualityScores;
  passed: boolean;          // All scores >= 3
  feedback: string;         // Explanation of evaluation
  suggestedTheme?: string;  // New theme if not passed
}

/**
 * Record of one iteration round
 */
export interface IterationRound {
  roundNumber: number;
  theme: string;
  evaluation?: QualityEvaluation;
  cardIds: string[];
  keyFindings: string[];          // Main findings from this iteration
  discussionHighlights: string[]; // Key discussion points
  startedAt: string;
  endedAt?: string;
}

/**
 * Context summary for passing between iterations
 * This helps agents avoid repeating themselves and build on previous findings
 */
export interface IterationContext {
  originalTopic: string;
  currentIteration: number;
  previousIterations: {
    roundNumber: number;
    theme: string;
    findings: string[];
    evaluation?: {
      passed: boolean;
      feedback: string;
    };
  }[];
  cumulativeFindings: string[];    // All unique findings so far
  areasToDeepen: string[];         // Areas identified for further analysis
  areasToAvoid: string[];          // Topics already exhausted/covered
}
