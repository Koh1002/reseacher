// =============================================
// Workflow State Machine & Orchestration
// =============================================

import type { WorkflowState, AnalysisReport } from '../types';
import { useCouncilStore } from '../store/councilStore';
import { DemoAgent, DemoChairAgent } from './demoAgents';
import { loadCSV, initDuckDB, tableExists } from '../utils/duckdb';

// Get base path for assets
const BASE_PATH = import.meta.env.BASE_URL || '/';

/**
 * Delay helper for animation pacing
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Workflow orchestrator class
 */
export class WorkflowOrchestrator {
  private isRunning = false;
  private abortController: AbortController | null = null;

  /**
   * Initialize database with sample data
   */
  async initializeData(): Promise<void> {
    const store = useCouncilStore.getState();
    if (store.isDataLoaded) return;

    await initDuckDB();

    // Check if table already exists
    const exists = await tableExists('purchase_history');
    if (!exists) {
      const csvUrl = `${BASE_PATH}data/purchase_history.csv`;
      await loadCSV('purchase_history', csvUrl);
    }

    store.setDataLoaded(true);
    console.log('[Workflow] Data initialized');
  }

  /**
   * Start the analysis workflow
   */
  async start(topic: string): Promise<void> {
    if (this.isRunning) {
      console.warn('[Workflow] Already running');
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const store = useCouncilStore.getState();
    const animationSpeed = store.config.animation_speed;

    try {
      // Initialize data if needed
      await this.initializeData();

      // Create session
      store.startSession(topic);
      await delay(animationSpeed);

      // Run state machine
      await this.runStateMachine(animationSpeed);
    } catch (error) {
      console.error('[Workflow] Error:', error);
      store.setWorkflowState('ERROR');
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * Stop the workflow
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  /**
   * Main state machine loop
   */
  private async runStateMachine(animationSpeed: number): Promise<void> {
    const transitions: Record<WorkflowState, () => Promise<WorkflowState>> = {
      IDLE: async () => 'PLANNING',
      PLANNING: async () => this.runPlanning(animationSpeed),
      ISSUE_DECOMPOSE: async () => this.runIssueDecompose(animationSpeed),
      ANALYZING: async () => this.runAnalyzing(animationSpeed),
      COUNCIL: async () => this.runCouncil(animationSpeed),
      ITERATE: async () => this.checkIteration(),
      FINALIZE: async () => this.runFinalize(animationSpeed),
      DONE: async () => 'DONE',
      ERROR: async () => 'ERROR',
    };

    let currentState: WorkflowState = 'IDLE';

    while (currentState !== 'DONE' && currentState !== 'ERROR') {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        console.log('[Workflow] Aborted');
        return;
      }

      // Update state
      useCouncilStore.getState().setWorkflowState(currentState);
      await delay(animationSpeed / 2);

      // Execute transition
      const nextState = await transitions[currentState]();
      console.log(`[Workflow] ${currentState} -> ${nextState}`);
      currentState = nextState;
    }

    useCouncilStore.getState().setWorkflowState(currentState);
  }

  /**
   * PLANNING phase: Chair sets up the council
   */
  private async runPlanning(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const chair = session.agents.find((a) => a.role === 'chair')!;
    const analysts = session.agents.filter((a) => a.role !== 'chair');

    // Update chair status
    store.setAgentStatus(chair.id, 'planning');
    store.setAgentProgress(chair.id, 50);

    const chairAgent = new DemoChairAgent(chair);
    const planMessage = chairAgent.generatePlanningMessage(session.topic, analysts);
    store.addMessage(planMessage);

    await delay(animationSpeed);

    store.setAgentProgress(chair.id, 100);
    store.setAgentStatus(chair.id, 'waiting');

    return 'ISSUE_DECOMPOSE';
  }

  /**
   * ISSUE_DECOMPOSE phase: Analysts create issues
   */
  private async runIssueDecompose(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const analysts = session.agents.filter((a) => a.role !== 'chair');

    for (const analyst of analysts) {
      store.setAgentStatus(analyst.id, 'planning');
      store.setAgentProgress(analyst.id, 30);

      const demoAgent = new DemoAgent(analyst);
      const issues = await demoAgent.generateIssues(session.topic);

      for (const issue of issues) {
        store.addIssue(issue);
        store.addMessage({
          speaker: analyst.id,
          type: 'proposal',
          content: `【論点設定】${issue.title}\n${issue.description}\n\n仮説:\n${issue.hypotheses.map((h) => `- ${h}`).join('\n')}`,
          ref_issues: [issue.id],
        });
        await delay(animationSpeed / 2);
      }

      store.setAgentProgress(analyst.id, 100);
      store.setAgentStatus(analyst.id, 'waiting');
    }

    // Chair announces transition
    const chair = session.agents.find((a) => a.role === 'chair')!;
    const chairAgent = new DemoChairAgent(chair);
    store.addMessage(chairAgent.generateTransitionMessage('analyzing'));

    return 'ANALYZING';
  }

  /**
   * ANALYZING phase: Analysts perform data analysis
   */
  private async runAnalyzing(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const analysts = session.agents.filter((a) => a.role !== 'chair');

    for (const analyst of analysts) {
      store.setAgentStatus(analyst.id, 'analyzing');
      store.setAgentProgress(analyst.id, 0);

      const demoAgent = new DemoAgent(analyst);
      const assignedIssues = session.issues.filter((i) => i.assigned_to === analyst.id);

      let progress = 0;
      for (const issue of assignedIssues) {
        store.updateIssue(issue.id, { status: 'in_progress' });

        const cards = await demoAgent.analyzeIssue(issue);
        progress += Math.floor(100 / assignedIssues.length);
        store.setAgentProgress(analyst.id, Math.min(progress, 95));

        for (const card of cards) {
          store.addCard(card);
          store.addMessage({
            speaker: analyst.id,
            type: 'proposal',
            content: `【分析結果】${card.claim}\n\n信頼度: ${card.confidence}\n手法: ${card.method}`,
            ref_cards: [card.id],
            ref_issues: [issue.id],
          });
          await delay(animationSpeed);
        }

        store.updateIssue(issue.id, { status: 'resolved' });
      }

      store.setAgentProgress(analyst.id, 100);
      store.setAgentStatus(analyst.id, 'done');
    }

    // Chair announces transition to council
    const chair = session.agents.find((a) => a.role === 'chair')!;
    const chairAgent = new DemoChairAgent(chair);
    store.addMessage(chairAgent.generateTransitionMessage('council'));

    return 'COUNCIL';
  }

  /**
   * COUNCIL phase: Discussion
   */
  private async runCouncil(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const analysts = session.agents.filter((a) => a.role !== 'chair');

    for (const analyst of analysts) {
      store.setAgentStatus(analyst.id, 'discussing');

      const demoAgent = new DemoAgent(analyst);
      const myCards = session.cards.filter((c) => c.author_agent === analyst.id);
      const otherCards = session.cards.filter((c) => c.author_agent !== analyst.id);

      const discussionMessages = demoAgent.generateDiscussionMessages(myCards, otherCards);

      for (const msg of discussionMessages) {
        store.addMessage(msg);
        await delay(animationSpeed);
      }

      store.setAgentStatus(analyst.id, 'done');
    }

    store.incrementRound();
    return 'ITERATE';
  }

  /**
   * Check if we should iterate or finalize
   */
  private async checkIteration(): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;

    // Check stopping conditions
    const allAnalystsSubmitted = session.agents
      .filter((a) => a.role !== 'chair')
      .every((a) => a.cards_submitted >= 1 && a.messages_sent >= 1);

    const maxRoundsReached = session.round >= session.max_rounds;

    if (allAnalystsSubmitted || maxRoundsReached) {
      return 'FINALIZE';
    }

    return 'ANALYZING';
  }

  /**
   * FINALIZE phase: Generate final report
   */
  private async runFinalize(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const chair = session.agents.find((a) => a.role === 'chair')!;

    store.setAgentStatus(chair.id, 'analyzing');
    store.setAgentProgress(chair.id, 50);

    const chairAgent = new DemoChairAgent(chair);
    store.addMessage(chairAgent.generateTransitionMessage('finalize'));
    await delay(animationSpeed);

    const reportData = chairAgent.generateFinalReport(
      session.topic,
      session.cards,
      session.issues,
      session.messages,
      session.agents,
      session.started_at
    );

    const report: AnalysisReport = {
      analysis_story: reportData.analysis_story,
      minutes: reportData.minutes,
      appendix: {
        issues: session.issues,
        cards: session.cards,
      },
      generated_at: new Date().toISOString(),
    };

    store.setReport(report);

    store.addMessage({
      speaker: chair.id,
      type: 'summary',
      content: `【分析完了】\n\n${reportData.key_findings.slice(0, 3).map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n詳細は「分析ストーリー」タブをご覧ください。`,
    });

    store.setAgentProgress(chair.id, 100);
    store.setAgentStatus(chair.id, 'done');
    store.endSession();

    return 'DONE';
  }
}

// Singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
