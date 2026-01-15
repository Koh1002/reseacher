// =============================================
// Workflow State Machine & Orchestration
// =============================================

import type { WorkflowState, AnalysisReport, Message, DataSchema, QualityEvaluation, IterationRound } from '../types';
import { useCouncilStore } from '../store/councilStore';
import { DemoAgent, DemoChairAgent } from './demoAgents';
import { LLMAgent, LLMChairAgent, executeAnalysisQueries } from './llmAgents';
import { LLMClient, getAvailableProviders, type LLMProvider } from '../utils/llmClient';
import { loadCSV, initDuckDB, tableExists, generateDynamicQueries, ANALYSIS_QUERIES } from '../utils/duckdb';

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
  private llmClients: Map<string, LLMClient> = new Map();
  private dataSchema: DataSchema | null = null;
  private dynamicQueries: Record<string, string> | null = null;

  /**
   * Initialize database with sample data or use BYD data
   */
  async initializeData(providedSchema?: DataSchema): Promise<void> {
    const store = useCouncilStore.getState();

    // If BYD mode with provided schema, use that
    if (providedSchema) {
      this.dataSchema = providedSchema;
      this.dynamicQueries = generateDynamicQueries(providedSchema);
      store.setDataLoaded(true);
      console.log('[Workflow] BYD Data initialized with schema:', providedSchema.tableName);
      return;
    }

    // Check if we have a schema from store (BYD mode)
    const storeSchema = store.dataSchema;
    if (storeSchema) {
      this.dataSchema = storeSchema;
      this.dynamicQueries = generateDynamicQueries(storeSchema);
      store.setDataLoaded(true);
      console.log('[Workflow] Using existing BYD schema:', storeSchema.tableName);
      return;
    }

    // Standard DEMO mode - load sample data
    if (store.isDataLoaded) return;

    await initDuckDB();

    // Check if table already exists
    const exists = await tableExists('purchase_history');
    if (!exists) {
      const csvUrl = `${BASE_PATH}data/purchase_history.csv`;
      await loadCSV('purchase_history', csvUrl);
    }

    this.dataSchema = null;
    this.dynamicQueries = null;
    store.setDataLoaded(true);
    console.log('[Workflow] DEMO Data initialized');
  }

  /**
   * Get the appropriate queries (dynamic for BYD, static for DEMO)
   */
  getQueries(): Record<string, string> {
    if (this.dynamicQueries) {
      return this.dynamicQueries;
    }
    return ANALYSIS_QUERIES as Record<string, string>;
  }

  /**
   * Check if using BYD mode
   */
  isBYDMode(): boolean {
    return this.dataSchema !== null;
  }

  /**
   * Initialize LLM clients based on API keys
   */
  private initializeLLMClients(): void {
    const store = useCouncilStore.getState();
    const { apiKeys } = store;

    this.llmClients.clear();

    // Get available providers
    const providers = getAvailableProviders(apiKeys);

    if (providers.length === 0) {
      console.log('[Workflow] No API keys provided, using DEMO mode');
      return;
    }

    // Get analyst agent IDs (excluding chair)
    const session = store.session;
    if (!session) return;

    const analystIds = session.agents
      .filter((a) => a.role !== 'chair')
      .map((a) => a.id);

    // Randomly assign providers to agents
    const assignments = new Map<string, LLMProvider>();

    // Shuffle analysts for random assignment
    const shuffledAnalysts = [...analystIds].sort(() => Math.random() - 0.5);

    shuffledAnalysts.forEach((agentId, index) => {
      const provider = providers[index % providers.length];
      assignments.set(agentId, provider);

      // Create client for this agent
      const apiKey = apiKeys[provider];
      if (apiKey) {
        this.llmClients.set(agentId, new LLMClient({ provider, apiKey }));
      }
    });

    // Chair always uses the first available provider
    const chairAgent = session.agents.find((a) => a.role === 'chair');
    if (chairAgent) {
      const chairProvider = providers[0];
      assignments.set(chairAgent.id, chairProvider);
      this.llmClients.set(chairAgent.id, new LLMClient({
        provider: chairProvider,
        apiKey: apiKeys[chairProvider],
      }));
    }

    store.setAgentLLMAssignments(assignments);
    console.log('[Workflow] LLM clients initialized:', Object.fromEntries(assignments));
  }

  /**
   * Check if we're in LLM mode
   */
  private isLLMMode(): boolean {
    return this.llmClients.size > 0;
  }

  /**
   * Get LLM client for an agent
   */
  private getClientForAgent(agentId: string): LLMClient | undefined {
    return this.llmClients.get(agentId);
  }

  /**
   * Start the analysis workflow
   */
  async start(topic: string, dataSchema?: DataSchema): Promise<void> {
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
      await this.initializeData(dataSchema);

      // Create session
      store.startSession(topic);
      await delay(animationSpeed);

      // Add initial iteration round
      const initialRound: IterationRound = {
        roundNumber: 1,
        theme: topic,
        cardIds: [],
        startedAt: new Date().toISOString(),
      };
      store.addIterationRound(initialRound);

      // Initialize LLM clients
      this.initializeLLMClients();

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
      DATA_SCAN: async () => this.runDataScan(animationSpeed),
      PLANNING: async () => this.runPlanning(animationSpeed),
      ISSUE_DECOMPOSE: async () => this.runIssueDecompose(animationSpeed),
      ANALYZING: async () => this.runAnalyzing(animationSpeed),
      COUNCIL: async () => this.runCouncil(animationSpeed),
      QUALITY_CHECK: async () => this.runQualityCheck(animationSpeed),
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
   * DATA_SCAN phase: Analyze BYD data structure (only for BYD mode)
   */
  private async runDataScan(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const chair = session.agents.find((a) => a.role === 'chair')!;

    if (!this.dataSchema) {
      return 'PLANNING';
    }

    store.setAgentStatus(chair.id, 'analyzing');

    store.addMessage({
      speaker: chair.id,
      type: 'system',
      content: `【データスキャン完了】\n${this.dataSchema.summary}`,
    });

    await delay(animationSpeed);
    store.setAgentStatus(chair.id, 'waiting');

    return 'PLANNING';
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

    let planMessage: string;

    if (this.isLLMMode()) {
      const client = this.getClientForAgent(chair.id);
      if (client) {
        const chairAgent = new LLMChairAgent(chair, client);
        planMessage = await chairAgent.generatePlanningMessage(session.topic, analysts);
      } else {
        const demoChair = new DemoChairAgent(chair);
        planMessage = demoChair.generatePlanningMessage(session.topic, analysts).content;
      }
    } else {
      const demoChair = new DemoChairAgent(chair);
      planMessage = demoChair.generatePlanningMessage(session.topic, analysts).content;
    }

    store.addMessage({
      speaker: chair.id,
      type: 'proposal',
      content: planMessage,
    });

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

      let issues;

      if (this.isLLMMode()) {
        const client = this.getClientForAgent(analyst.id);
        if (client) {
          const llmAgent = new LLMAgent(analyst, client);
          issues = await llmAgent.generateIssues(session.topic);
        } else {
          const demoAgent = new DemoAgent(analyst);
          issues = await demoAgent.generateIssues(session.topic);
        }
      } else {
        const demoAgent = new DemoAgent(analyst);
        issues = await demoAgent.generateIssues(session.topic);
      }

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
    store.addMessage({
      speaker: chair.id,
      type: 'system',
      content: '【分析フェーズ開始】各アナリストが担当論点の分析を開始します。',
    });

    return 'ANALYZING';
  }

  /**
   * ANALYZING phase: Analysts perform data analysis
   */
  private async runAnalyzing(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();

    // Get fresh session to ensure we have all issues from ISSUE_DECOMPOSE phase
    const session = useCouncilStore.getState().session;
    if (!session) {
      console.error('[Workflow] No session found in ANALYZING phase');
      return 'ERROR';
    }

    const analysts = session.agents.filter((a) => a.role !== 'chair');

    console.log(`[Workflow] ANALYZING phase: ${session.issues.length} issues to analyze`);

    for (const analyst of analysts) {
      try {
        store.setAgentStatus(analyst.id, 'analyzing');
        store.setAgentProgress(analyst.id, 0);

        // Get fresh issues from store
        const currentSession = useCouncilStore.getState().session;
        const assignedIssues = (currentSession?.issues || []).filter((i) => i.assigned_to === analyst.id);

        console.log(`[Workflow] ${analyst.name} has ${assignedIssues.length} assigned issues`);

        // Skip if no issues assigned
        if (assignedIssues.length === 0) {
          console.warn(`[Workflow] No issues assigned to ${analyst.name}, skipping`);
          store.setAgentProgress(analyst.id, 100);
          store.setAgentStatus(analyst.id, 'done');
          continue;
        }

        let progress = 0;
        for (const issue of assignedIssues) {
          try {
            store.updateIssue(issue.id, { status: 'in_progress' });

            let cards;

            if (this.isLLMMode()) {
              const client = this.getClientForAgent(analyst.id);
              if (client) {
                try {
                  const llmAgent = new LLMAgent(analyst, client);
                  const queryResults = await executeAnalysisQueries(analyst.role);
                  cards = await llmAgent.analyzeIssue(issue, queryResults);
                } catch (llmError) {
                  console.error(`[Workflow] LLM analysis failed for ${analyst.name}, falling back to demo:`, llmError);
                  const demoAgent = new DemoAgent(analyst);
                  cards = await demoAgent.analyzeIssue(issue);
                }
              } else {
                const demoAgent = new DemoAgent(analyst);
                cards = await demoAgent.analyzeIssue(issue);
              }
            } else {
              const demoAgent = new DemoAgent(analyst);
              cards = await demoAgent.analyzeIssue(issue);
            }

            progress += Math.floor(100 / Math.max(assignedIssues.length, 1));
            store.setAgentProgress(analyst.id, Math.min(progress, 95));

            // Handle case where no cards were generated
            if (!cards || cards.length === 0) {
              console.warn(`[Workflow] No cards generated for issue ${issue.title}`);
              store.updateIssue(issue.id, { status: 'resolved' });
              continue;
            }

            console.log(`[Workflow] ${analyst.name} generated ${cards.length} cards for issue "${issue.title}"`);

            for (const card of cards) {
              store.addCard(card);
              console.log(`[Workflow] Added card: "${card.claim.substring(0, 50)}..." with chart: ${card.chart_spec ? 'yes' : 'no'}`);

              // Generate message about findings with error handling
              let findingsMessage: string;
              try {
                if (this.isLLMMode()) {
                  const client = this.getClientForAgent(analyst.id);
                  if (client) {
                    const llmAgent = new LLMAgent(analyst, client);
                    findingsMessage = await llmAgent.generateFindingsMessage(card);
                  } else {
                    findingsMessage = `【分析結果報告】${card.claim}`;
                  }
                } else {
                  findingsMessage = `【分析結果報告】${card.claim}\n\n信頼度: ${card.confidence}\n手法: ${card.method}`;
                }
              } catch (msgError) {
                console.warn(`[Workflow] Failed to generate findings message:`, msgError);
                findingsMessage = `【分析結果報告】${card.claim}`;
              }

              store.addMessage({
                speaker: analyst.id,
                type: 'proposal',
                content: findingsMessage,
                ref_cards: [card.id],
                ref_issues: [issue.id],
              });
              await delay(animationSpeed);
            }

            store.updateIssue(issue.id, { status: 'resolved' });
          } catch (issueError) {
            console.error(`[Workflow] Error processing issue ${issue.title}:`, issueError);
            store.updateIssue(issue.id, { status: 'resolved' });
          }
        }

        store.setAgentProgress(analyst.id, 100);
        store.setAgentStatus(analyst.id, 'done');
      } catch (analystError) {
        console.error(`[Workflow] Error processing analyst ${analyst.name}:`, analystError);
        store.setAgentProgress(analyst.id, 100);
        store.setAgentStatus(analyst.id, 'done');
      }
    }

    // Chair announces transition to council
    const chair = session.agents.find((a) => a.role === 'chair')!;
    store.addMessage({
      speaker: chair.id,
      type: 'system',
      content: '【議論フェーズ開始】全アナリストの分析結果が出揃いました。相互レビューと議論を開始します。',
    });

    return 'COUNCIL';
  }

  /**
   * COUNCIL phase: Enhanced discussion with critiques and responses
   */
  private async runCouncil(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();

    // Get fresh session state to ensure we have all cards from ANALYZING phase
    const session = useCouncilStore.getState().session;
    if (!session) {
      console.error('[Workflow] No session found in COUNCIL phase');
      return 'ERROR';
    }

    const analysts = session.agents.filter((a) => a.role !== 'chair');

    console.log(`[Workflow] COUNCIL phase: ${session.cards.length} cards, ${session.messages.length} messages`);

    // Phase 1: Each analyst critiques others' work
    for (const analyst of analysts) {
      try {
        store.setAgentStatus(analyst.id, 'discussing');

        // Get fresh cards from store
        const currentSession = useCouncilStore.getState().session;
        const allCards = currentSession?.cards || [];
        const otherCards = allCards.filter((c) => c.author_agent !== analyst.id);

        console.log(`[Workflow] ${analyst.name} reviewing ${otherCards.length} cards from others`);

        // Skip if no other cards to critique
        if (otherCards.length === 0) {
          console.warn(`[Workflow] No cards to critique for ${analyst.name}`);
          store.setAgentStatus(analyst.id, 'waiting');
          continue;
        }

        // Critique multiple other cards
        const cardsToReview = otherCards.slice(0, 3); // Review up to 3 other cards

        for (const targetCard of cardsToReview) {
          try {
            const targetAgent = session.agents.find((a) => a.id === targetCard.author_agent);
            if (!targetAgent) continue;

            let critique: { type: 'question' | 'critique' | 'support'; content: string };

            if (this.isLLMMode()) {
              const client = this.getClientForAgent(analyst.id);
              if (client) {
                try {
                  const llmAgent = new LLMAgent(analyst, client);
                  critique = await llmAgent.generateCritique(targetCard, targetAgent.name);
                } catch (llmError) {
                  console.warn(`[Workflow] LLM critique failed, using demo:`, llmError);
                  critique = this.generateDemoCritique(targetCard, targetAgent.name);
                }
              } else {
                critique = this.generateDemoCritique(targetCard, targetAgent.name);
              }
            } else {
              critique = this.generateDemoCritique(targetCard, targetAgent.name);
            }

            store.addMessage({
              speaker: analyst.id,
              type: critique.type,
              content: critique.content,
              ref_cards: [targetCard.id],
            });
            await delay(animationSpeed);
          } catch (critiqueError) {
            console.warn(`[Workflow] Error generating critique:`, critiqueError);
          }
        }

        store.setAgentStatus(analyst.id, 'waiting');
      } catch (analystError) {
        console.error(`[Workflow] Error in council phase for ${analyst.name}:`, analystError);
        store.setAgentStatus(analyst.id, 'waiting');
      }
    }

    // Phase 2: Analysts respond to critiques about their work
    await delay(animationSpeed);

    try {
      const currentSession = useCouncilStore.getState().session;
      if (!currentSession) {
        console.warn('[Workflow] Session not found during council phase 2');
        store.incrementRound();
        return 'QUALITY_CHECK';
      }

      const critiques = currentSession.messages.filter(
        (m) => m.type === 'critique' || m.type === 'question'
      );

      for (const critique of critiques) {
        try {
          const refCardId = critique.ref_cards?.[0];
          if (!refCardId) continue;

          const card = currentSession.cards.find((c) => c.id === refCardId);
          if (!card) continue;

          const cardAuthor = currentSession.agents.find((a) => a.id === card.author_agent);
          const critiquer = currentSession.agents.find((a) => a.id === critique.speaker);
          if (!cardAuthor || !critiquer || cardAuthor.id === critique.speaker) continue;

          store.setAgentStatus(cardAuthor.id, 'discussing');

          let response: string;

          if (this.isLLMMode()) {
            const client = this.getClientForAgent(cardAuthor.id);
            if (client) {
              try {
                const llmAgent = new LLMAgent(cardAuthor, client);
                response = await llmAgent.generateResponse(critique, card, critiquer.name);
              } catch (llmError) {
                console.warn(`[Workflow] LLM response failed, using demo:`, llmError);
                response = this.generateDemoResponse(critique, card, critiquer.name);
              }
            } else {
              response = this.generateDemoResponse(critique, card, critiquer.name);
            }
          } else {
            response = this.generateDemoResponse(critique, card, critiquer.name);
          }

          store.addMessage({
            speaker: cardAuthor.id,
            type: 'support',
            content: response,
            ref_cards: [card.id],
          });
          await delay(animationSpeed);

          store.setAgentStatus(cardAuthor.id, 'done');
        } catch (responseError) {
          console.warn(`[Workflow] Error generating response:`, responseError);
        }
      }
    } catch (phase2Error) {
      console.error(`[Workflow] Error in council phase 2:`, phase2Error);
    }

    // Mark all analysts as done
    for (const analyst of analysts) {
      store.setAgentStatus(analyst.id, 'done');
    }

    store.incrementRound();
    return 'QUALITY_CHECK';
  }

  /**
   * Generate demo critique
   */
  private generateDemoCritique(
    targetCard: { claim: string; confidence: string },
    targetAgentName: string
  ): { type: 'question' | 'critique' | 'support'; content: string } {
    const templates = [
      {
        type: 'question' as const,
        templates: [
          `${targetAgentName}の分析について、このパターンは特定の期間に限定されていませんか？季節性の影響を除外する必要があるかもしれません。`,
          `興味深い発見ですね。セグメント別に分けた場合、同じ傾向が見られますか？`,
          `${targetAgentName}にお聞きしたいのですが、サンプルサイズは統計的に有意な結論を導くのに十分でしょうか？`,
        ],
      },
      {
        type: 'critique' as const,
        templates: [
          `${targetAgentName}の分析結果について、外れ値の影響を受けている可能性があります。ロバストな統計手法を検討すべきでは？`,
          `この結論には同意しかねます。相関関係と因果関係を混同していないでしょうか？`,
          `${targetCard.confidence}の信頼度とのことですが、もう少し慎重な解釈が必要かもしれません。`,
        ],
      },
      {
        type: 'support' as const,
        templates: [
          `${targetAgentName}の分析結果は、私の分析とも整合性があります。特にこのパターンは重要な示唆を含んでいます。`,
          `素晴らしい発見です。この知見は施策設計に直接活用できそうです。`,
          `同意します。私の分析からも同様の傾向が確認でき、この結論の妥当性を支持します。`,
        ],
      },
    ];

    const typeChoice = templates[Math.floor(Math.random() * templates.length)];
    const content = typeChoice.templates[Math.floor(Math.random() * typeChoice.templates.length)];

    return { type: typeChoice.type, content };
  }

  /**
   * Generate demo response to critique
   */
  private generateDemoResponse(
    _critique: Message,
    card: { claim: string; method: string },
    critiquerName: string
  ): string {
    const templates = [
      `${critiquerName}のご指摘ありがとうございます。確かにその点は重要です。今回の分析では${card.method}を採用しましたが、ご指摘の観点を追加分析で検証する価値があると思います。`,
      `ご質問ありがとうございます。${card.claim}という結論に至った背景として、複数の指標で一貫した傾向が確認できたことがあります。ただし、${critiquerName}のご指摘のとおり、追加検証の余地はあります。`,
      `貴重なフィードバックに感謝します。ご指摘の限界は認識しており、今後の分析で対応したいと思います。現時点では、利用可能なデータの範囲で最善の分析を行いました。`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * QUALITY_CHECK phase: Chair evaluates the analysis quality
   */
  private async runQualityCheck(animationSpeed: number): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;
    const chair = session.agents.find((a) => a.role === 'chair')!;
    const currentIteration = session.iteration;

    store.setAgentStatus(chair.id, 'analyzing');

    // Get cards from current iteration
    const currentRound = session.iterationHistory.find((r) => r.roundNumber === currentIteration);
    const iterationCards = session.cards.filter((c) =>
      currentRound?.cardIds.includes(c.id) || !currentRound
    );

    let evaluation: QualityEvaluation;

    if (this.isLLMMode()) {
      const client = this.getClientForAgent(chair.id);
      if (client) {
        evaluation = await this.generateLLMQualityEvaluation(client, session.topic, iterationCards, session.messages);
      } else {
        evaluation = this.generateDemoQualityEvaluation(iterationCards, currentIteration);
      }
    } else {
      evaluation = this.generateDemoQualityEvaluation(iterationCards, currentIteration);
    }

    store.setQualityEvaluation(evaluation);

    // Update current iteration round with evaluation
    store.updateIterationRound(currentIteration, {
      evaluation,
      endedAt: new Date().toISOString(),
    });

    // Announce evaluation results
    const scoreText = `具体性: ${evaluation.scores.specificity}/5, 新規性: ${evaluation.scores.novelty}/5, アクション明瞭さ: ${evaluation.scores.actionClarity}/5`;

    if (evaluation.passed) {
      store.addMessage({
        speaker: chair.id,
        type: 'decision',
        content: `【品質評価: 合格】\n${scoreText}\n\n${evaluation.feedback}`,
      });
    } else {
      store.addMessage({
        speaker: chair.id,
        type: 'critique',
        content: `【品質評価: 再分析が必要】\n${scoreText}\n\n${evaluation.feedback}\n\n次のイテレーションでは「${evaluation.suggestedTheme}」に焦点を当てて分析を深めます。`,
      });
    }

    await delay(animationSpeed);
    store.setAgentStatus(chair.id, 'waiting');

    return 'ITERATE';
  }

  /**
   * Generate quality evaluation using LLM
   */
  private async generateLLMQualityEvaluation(
    client: LLMClient,
    topic: string,
    cards: { claim: string; metrics: { name: string; value: number | string; unit?: string }[]; confidence: string }[],
    messages: Message[]
  ): Promise<QualityEvaluation> {
    const cardSummary = cards.map((c) => `- ${c.claim} (信頼度: ${c.confidence})`).join('\n');
    const discussionHighlights = messages
      .filter((m) => m.type === 'critique' || m.type === 'question' || m.type === 'support')
      .slice(-5)
      .map((m) => `- ${m.content.substring(0, 80)}...`)
      .join('\n');

    const prompt = `あなたは分析議会の議長です。以下の分析結果を評価してください。

【分析テーマ】
${topic}

【エビデンスカード】
${cardSummary}

【議論のハイライト】
${discussionHighlights || 'なし'}

以下の3つの観点で1-5の点数をつけ、JSON形式で回答してください：

1. 具体性 (specificity): 分析結果が具体的で実行可能か
2. 新規性 (novelty): 当たり前でない新しい発見があるか
3. アクション明瞭さ (actionClarity): 次のアクションが明確に示されているか

評価基準：
- 1-2点: 不十分、再分析が必要
- 3点: 最低限の基準を満たす
- 4-5点: 優れている

JSON形式:
{
  "specificity": 数値(1-5),
  "novelty": 数値(1-5),
  "actionClarity": 数値(1-5),
  "feedback": "評価の説明（2-3文）",
  "suggestedTheme": "再分析が必要な場合の新テーマ（任意）"
}`;

    try {
      const response = await client.chat([
        { role: 'system', content: 'あなたはデータ分析の品質を評価する専門家です。' },
        { role: 'user', content: prompt },
      ], { temperature: 0.5 });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const scores = {
          specificity: Math.min(5, Math.max(1, Number(parsed.specificity) || 3)),
          novelty: Math.min(5, Math.max(1, Number(parsed.novelty) || 3)),
          actionClarity: Math.min(5, Math.max(1, Number(parsed.actionClarity) || 3)),
        };
        const passed = scores.specificity >= 3 && scores.novelty >= 3 && scores.actionClarity >= 3;

        return {
          scores,
          passed,
          feedback: parsed.feedback || '評価を完了しました。',
          suggestedTheme: passed ? undefined : (parsed.suggestedTheme || `${topic}の詳細分析`),
        };
      }
    } catch (error) {
      console.warn('[Workflow] LLM quality evaluation failed:', error);
    }

    // Fallback to demo evaluation
    return this.generateDemoQualityEvaluation(cards, 1);
  }

  /**
   * Generate demo quality evaluation
   */
  private generateDemoQualityEvaluation(
    _cards: { claim: string; confidence: string }[],
    currentIteration: number
  ): QualityEvaluation {
    // Progressively improve scores in later iterations
    const baseScore = Math.min(2 + currentIteration, 4);
    const variance = () => Math.floor(Math.random() * 2) - 1;

    const scores = {
      specificity: Math.min(5, Math.max(1, baseScore + variance())),
      novelty: Math.min(5, Math.max(1, baseScore + variance() - 1)),
      actionClarity: Math.min(5, Math.max(1, baseScore + variance())),
    };

    const passed = scores.specificity >= 3 && scores.novelty >= 3 && scores.actionClarity >= 3;

    const feedbackTemplates = {
      low: [
        '分析結果がまだ表面的です。より具体的なデータポイントと実行可能なアクションが必要です。',
        '新規性のある発見が不足しています。一般的な傾向以上の深い洞察を求めます。',
        '次のアクションが不明確です。具体的な施策提案が必要です。',
      ],
      pass: [
        '分析結果は十分な具体性と実行可能性を持っています。',
        '有意義な発見があり、ビジネス価値のある洞察が得られました。',
        '次のステップが明確に示されており、実行に移せる状態です。',
      ],
    };

    const suggestedThemes = [
      '顧客セグメント別の購買パターン深掘り',
      '店舗間のベストプラクティス特定',
      '季節性を考慮した需要予測',
      '高LTV顧客の行動特性分析',
      '併買パターンからのクロスセル機会発見',
    ];

    return {
      scores,
      passed,
      feedback: passed
        ? feedbackTemplates.pass[Math.floor(Math.random() * feedbackTemplates.pass.length)]
        : feedbackTemplates.low[Math.floor(Math.random() * feedbackTemplates.low.length)],
      suggestedTheme: passed ? undefined : suggestedThemes[Math.floor(Math.random() * suggestedThemes.length)],
    };
  }

  /**
   * Check if we should iterate or finalize
   */
  private async checkIteration(): Promise<WorkflowState> {
    const store = useCouncilStore.getState();
    const session = store.session!;

    const currentIteration = session.iteration;
    const minIterations = session.minIterations; // 3
    const maxIterations = session.maxIterations; // 5
    const evaluation = session.currentEvaluation;

    // Always run at least minIterations (3)
    if (currentIteration < minIterations) {
      console.log(`[Workflow] Iteration ${currentIteration}/${minIterations} (minimum not reached)`);
      return this.startNextIteration(store);
    }

    // If quality passed after minimum iterations, finalize
    if (evaluation?.passed) {
      console.log(`[Workflow] Quality check passed at iteration ${currentIteration}`);
      return 'FINALIZE';
    }

    // If max iterations reached, finalize anyway
    if (currentIteration >= maxIterations) {
      console.log(`[Workflow] Max iterations (${maxIterations}) reached, finalizing`);
      return 'FINALIZE';
    }

    // Otherwise, continue to next iteration with new theme
    console.log(`[Workflow] Quality not passed, continuing to iteration ${currentIteration + 1}`);
    return this.startNextIteration(store);
  }

  /**
   * Start the next iteration
   */
  private startNextIteration(store: ReturnType<typeof useCouncilStore.getState>): WorkflowState {
    const session = store.session!;
    const evaluation = session.currentEvaluation;

    // Increment iteration
    store.incrementIteration();

    // Update topic if suggested
    if (evaluation?.suggestedTheme) {
      store.setCurrentTopic(evaluation.suggestedTheme);
    }

    // Create new iteration round
    const newRound: IterationRound = {
      roundNumber: session.iteration + 1,
      theme: evaluation?.suggestedTheme || session.topic,
      cardIds: [],
      startedAt: new Date().toISOString(),
    };
    store.addIterationRound(newRound);

    // Reset agent states for new iteration
    session.agents.forEach((agent) => {
      if (agent.role !== 'chair') {
        store.setAgentStatus(agent.id, 'idle');
        store.setAgentProgress(agent.id, 0);
      }
    });

    // Clear issues for fresh analysis
    // Note: We keep cards and messages for historical context

    return 'ISSUE_DECOMPOSE';
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

    store.addMessage({
      speaker: chair.id,
      type: 'system',
      content: '【総括フェーズ】議論を踏まえ、最終的な分析ストーリーをまとめます。',
    });
    await delay(animationSpeed);

    let reportData: { analysis_story: string; key_findings: string[] };

    if (this.isLLMMode()) {
      const client = this.getClientForAgent(chair.id);
      if (client) {
        const llmChair = new LLMChairAgent(chair, client);
        reportData = await llmChair.generateFinalReport(
          session.topic,
          session.cards,
          session.issues,
          session.messages,
          session.agents
        );
      } else {
        reportData = this.generateDemoReport(session);
      }
    } else {
      reportData = this.generateDemoReport(session);
    }

    const durationSeconds = Math.round(
      (new Date().getTime() - new Date(session.started_at).getTime()) / 1000
    );

    const discussionPoints = session.issues.map((issue) => {
      const relatedCards = session.cards.filter((c) => c.author_agent === issue.assigned_to);
      const relatedMessages = session.messages.filter(
        (m) =>
          m.ref_cards?.some((cid) => relatedCards.map((c) => c.id).includes(cid)) ||
          m.ref_issues?.includes(issue.id)
      );

      return {
        issue_id: issue.id,
        issue_title: issue.title,
        messages: relatedMessages,
        conclusion: relatedCards[0]?.claim || '分析継続中',
      };
    });

    const report: AnalysisReport = {
      analysis_story: reportData.analysis_story,
      minutes: {
        summary: `「${session.topic}」に関する分析議会を実施しました。${session.agents.length}名のエージェントが参加し、${session.cards.length}件のエビデンスカードが提出されました。`,
        key_findings: reportData.key_findings,
        discussion_points: discussionPoints,
        participants: session.agents.map((a) => a.name),
        duration_seconds: durationSeconds,
      },
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

  /**
   * Generate demo report
   */
  private generateDemoReport(session: {
    topic: string;
    cards: Array<{ claim: string; method: string; confidence: string }>;
  }): { analysis_story: string; key_findings: string[] } {
    const keyFindings = session.cards
      .filter((c) => c.confidence !== 'low')
      .map((c) => c.claim)
      .slice(0, 5);

    const story = `# 分析レポート: ${session.topic}

## 概要
本分析では、購買履歴データを多角的に分析し、「${session.topic}」に関する知見を導出しました。

## 主要な発見
${keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## 詳細分析
各アナリストが専門の視点から分析を実施し、${session.cards.length}件のエビデンスカードを提出しました。議論フェーズでは相互レビューを行い、分析の妥当性を検証しました。

## 結論と推奨事項
本分析から、以下のアクションを推奨します:
1. データに基づく顧客セグメント別施策の検討
2. 店舗パフォーマンス差異の要因分析と横展開
3. 併買パターンを活用したクロスセル施策の実施`;

    return { analysis_story: story, key_findings: keyFindings };
  }
}

// Singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
