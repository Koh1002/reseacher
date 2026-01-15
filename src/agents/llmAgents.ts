// =============================================
// LLM-Based Agents Implementation
// =============================================

import type {
  Agent,
  EvidenceCard,
  Issue,
  Message,
  ChartSpec,
} from '../types';
import { LLMClient, type LLMMessage } from '../utils/llmClient';
import { executeQuery, ANALYSIS_QUERIES, type AnalysisQueryKey } from '../utils/duckdb';
import { generateId } from './protocol';

// ============ Helper Functions ============

/**
 * Calculate actual transaction count from aggregated query results
 * Different queries store counts in different fields
 */
function calculateActualCount(queryKey: string, data: Record<string, unknown>[]): number {
  if (!data || data.length === 0) return 0;

  switch (queryKey) {
    case 'totalSales':
      return Number(data[0].transaction_count) || 0;

    case 'monthlyTrend':
    case 'dayOfWeekPattern':
    case 'salesByCategory':
      return data.reduce((sum, r) => sum + (Number(r.transactions) || 0), 0);

    case 'storePerformance':
    case 'salesByStore':
      return data.reduce((sum, r) => sum + (Number(r.transactions) || 0), 0);

    case 'customerSegments':
    case 'customerLTV':
      return data.reduce((sum, r) => sum + (Number(r.customer_count) || 0), 0);

    case 'basketSize':
    case 'priceRangeAnalysis':
      return data.reduce((sum, r) => sum + (Number(r.transaction_count) || 0), 0);

    case 'categoryCoPurchase':
      return data.reduce((sum, r) => sum + (Number(r.co_occurrence_count) || 0), 0);

    case 'topProducts':
      return data.reduce((sum, r) => sum + (Number(r.purchase_count) || 0), 0);

    default:
      // Try common field names
      const firstRow = data[0];
      if ('transaction_count' in firstRow) {
        return data.reduce((sum, r) => sum + (Number(r.transaction_count) || 0), 0);
      }
      if ('transactions' in firstRow) {
        return data.reduce((sum, r) => sum + (Number(r.transactions) || 0), 0);
      }
      if ('customer_count' in firstRow) {
        return data.reduce((sum, r) => sum + (Number(r.customer_count) || 0), 0);
      }
      return data.length;
  }
}

// ============ System Prompts ============

const SYSTEM_PROMPTS = {
  chair: `あなたはデータ分析議会の議長（Chair）です。
あなたの役割:
- 分析テーマを受け取り、議会を進行する
- 各アナリストの分析結果を統合し、ストーリーを構築する
- 議論をファシリテートし、建設的な対話を促進する

回答は日本語で行ってください。簡潔かつ専門的に。`,

  growth_analyst: `あなたはGrowth Analyst（成長分析担当）です。
専門分野:
- 売上トレンド、成長率の分析
- 取引頻度、顧客数の推移
- 収益性指標の評価

購買履歴データを分析し、ビジネスの成長パターンを特定します。
回答は日本語で、データに基づいた具体的な洞察を提供してください。`,

  segment_analyst: `あなたはSegment Analyst（セグメント分析担当）です。
専門分野:
- 顧客セグメンテーション
- 購買行動パターンの分類
- 顧客ライフタイムバリューの分析

購買履歴から顧客を分類し、各セグメントの特徴を明らかにします。
回答は日本語で、セグメント間の違いを明確に示してください。`,

  basket_analyst: `あなたはBasket Analyst（バスケット分析担当）です。
専門分野:
- バスケット構成分析
- 併買パターンの発見
- クロスセル機会の特定

同一取引内での購買パターンを分析し、商品間の関連性を明らかにします。
回答は日本語で、実用的な併売施策を提案してください。`,

  seasonality_analyst: `あなたはSeasonality Analyst（季節性分析担当）です。
専門分野:
- 曜日別・月別パターンの検出
- 季節変動の分析
- イベント効果の測定

時系列データから周期的なパターンを発見し、需要予測に活かします。
回答は日本語で、時間軸に基づいた洞察を提供してください。`,
};

// ============ LLM Agent Class ============

export class LLMAgent {
  private client: LLMClient;
  public agent: Agent;

  constructor(agent: Agent, client: LLMClient) {
    this.agent = agent;
    this.client = client;
  }

  get providerName(): string {
    return this.client.provider;
  }

  private getSystemPrompt(): string {
    return SYSTEM_PROMPTS[this.agent.role as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.growth_analyst;
  }

  /**
   * Generate issues based on the analysis topic
   */
  async generateIssues(topic: string, contextPrompt: string = '', originalTopic?: string): Promise<Issue[]> {
    const contextSection = contextPrompt || '';
    const originalTopicNote = originalTopic && originalTopic !== topic
      ? `\n\n※元の分析依頼: 「${originalTopic}」に対する回答を深めることが最終目標です。`
      : '';

    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `分析テーマ: 「${topic}」${originalTopicNote}${contextSection}

このテーマについて、あなたの専門分野から分析すべき論点（Issue）を1-2個提案してください。
${contextPrompt ? '【重要】前回までの分析で判明した内容と重複しない、新しい視点からの論点を設定してください。' : ''}

以下のJSON形式で回答してください:
{
  "issues": [
    {
      "title": "論点のタイトル",
      "description": "詳細な説明",
      "why_it_matters": "なぜこの論点が重要か",
      "hypotheses": ["仮説1", "仮説2"]
    }
  ]
}`,
      },
    ];

    try {
      const response = await this.client.chat(messages, { temperature: 0.7 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON not found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.issues.map((issue: any) => ({
        id: generateId(),
        title: issue.title,
        description: issue.description,
        why_it_matters: issue.why_it_matters,
        hypotheses: issue.hypotheses || [],
        required_cards: ['evidence'],
        status: 'open' as const,
        assigned_to: this.agent.id,
      }));
    } catch (error) {
      console.error('[LLMAgent] Error generating issues:', error);
      // Fallback to a simple issue
      return [{
        id: generateId(),
        title: `${this.agent.name}の分析`,
        description: `${topic}に関する${this.agent.role}視点での分析`,
        why_it_matters: 'データに基づいた意思決定のため',
        hypotheses: ['データから傾向を発見できる'],
        required_cards: ['evidence'],
        status: 'open' as const,
        assigned_to: this.agent.id,
      }];
    }
  }

  /**
   * Analyze data and generate evidence card
   */
  async analyzeIssue(issue: Issue, queryResults: Record<string, any[]>): Promise<EvidenceCard[]> {
    // Prepare data summary for LLM (no raw data, only aggregates)
    const dataSummary = Object.entries(queryResults)
      .filter(([, results]) => results && results.length > 0)
      .map(([key, results]) => `【${key}】\n${JSON.stringify(results.slice(0, 10), null, 2)}`)
      .join('\n\n');

    // If no data available, return a fallback card
    if (!dataSummary) {
      console.warn('[LLMAgent] No query results available, creating fallback card');
      return [this.createFallbackCard(issue)];
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `論点: ${issue.title}
${issue.description}

仮説:
${issue.hypotheses.map((h, i) => `${i + 1}. ${h}`).join('\n')}

以下は集計済みデータの結果です（生データではなく、集計結果のみ）:

${dataSummary}

このデータを分析し、エビデンスカードを作成してください。

以下のJSON形式で回答してください:
{
  "claim": "データから導かれる主張（1-2文）",
  "method": "分析手法の説明",
  "confidence": "low" | "mid" | "high",
  "metrics": [
    {"name": "指標名", "value": 数値または文字列, "unit": "単位（任意）"}
  ],
  "caveats": ["注意点1", "注意点2"],
  "insight": "ビジネスへの示唆（2-3文）"
}`,
      },
    ];

    try {
      const response = await this.client.chat(messages, { temperature: 0.5 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[LLMAgent] JSON not found in response, creating fallback card');
        return [this.createFallbackCard(issue, queryResults)];
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.warn('[LLMAgent] JSON parse failed, creating fallback card:', parseError);
        return [this.createFallbackCard(issue, queryResults)];
      }

      // Validate required fields
      if (!parsed.claim || typeof parsed.claim !== 'string') {
        console.warn('[LLMAgent] Invalid claim in response, creating fallback card');
        return [this.createFallbackCard(issue, queryResults)];
      }

      // Get timeframe with error handling
      let timeframe = { start_date: '2024-01-01', end_date: '2024-03-31' };
      try {
        const timeframeResult = await executeQuery<{ start_date: string; end_date: string }>(
          ANALYSIS_QUERIES.timeframeSummary
        );
        if (timeframeResult && timeframeResult[0]) {
          timeframe = timeframeResult[0];
        }
      } catch (timeframeError) {
        console.warn('[LLMAgent] Failed to get timeframe, using default:', timeframeError);
      }

      // Generate chart spec from data
      const chartSpec = this.generateChartSpec(queryResults);

      const card: EvidenceCard = {
        id: generateId(),
        author_agent: this.agent.id,
        claim: parsed.claim,
        method: parsed.method || `${issue.title}の分析`,
        query_fingerprint: `LLM分析_${this.agent.role}_${Date.now().toString(36)}`,
        metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
        segment_def: `${this.agent.name}による分析`,
        timeframe: {
          from: String(timeframe.start_date).split('T')[0],
          to: String(timeframe.end_date).split('T')[0],
        },
        chart_spec: chartSpec,
        confidence: ['low', 'mid', 'high'].includes(parsed.confidence) ? parsed.confidence : 'mid',
        caveats: Array.isArray(parsed.caveats) ? parsed.caveats : [],
        created_at: new Date().toISOString(),
      };

      return [card];
    } catch (error) {
      console.error('[LLMAgent] Error analyzing issue:', error);
      // Return a fallback card instead of empty array
      return [this.createFallbackCard(issue, queryResults)];
    }
  }

  /**
   * Create a fallback evidence card when LLM fails
   */
  private createFallbackCard(issue: Issue, queryResults?: Record<string, any[]>): EvidenceCard {
    // Extract some basic metrics from query results if available
    const metrics: { name: string; value: number | string; unit?: string }[] = [];
    let claim = `${issue.title}の分析を実施しました。`;

    if (queryResults) {
      const firstResult = Object.entries(queryResults).find(([, v]) => v && v.length > 0);
      if (firstResult) {
        const [key, data] = firstResult;
        // Use actual count from aggregated results, not row count
        const actualCount = calculateActualCount(key, data);
        metrics.push({ name: 'データ件数', value: actualCount.toLocaleString(), unit: '件' });

        // Try to extract a meaningful claim with actual counts
        if (key === 'monthlyTrend' && data.length > 0) {
          const totalTransactions = calculateActualCount(key, data);
          claim = `${data.length}ヶ月分（${totalTransactions.toLocaleString()}件）のトレンドデータを分析しました。`;
        } else if (key === 'storePerformance' && data.length > 0) {
          const totalTransactions = calculateActualCount(key, data);
          claim = `${data.length}店舗（${totalTransactions.toLocaleString()}件）のパフォーマンスデータを分析しました。`;
        } else if (key === 'customerSegments' && data.length > 0) {
          const totalCustomers = calculateActualCount(key, data);
          claim = `${data.length}つの顧客セグメント（${totalCustomers.toLocaleString()}人）を分析しました。`;
        } else if (key === 'salesByCategory' && data.length > 0) {
          const totalTransactions = calculateActualCount(key, data);
          claim = `${data.length}部門（${totalTransactions.toLocaleString()}件）の売上データを分析しました。`;
        } else if (actualCount > 0) {
          claim = `${issue.title}の分析を実施しました（${actualCount.toLocaleString()}件のデータ）。`;
        }
      }
    }

    return {
      id: generateId(),
      author_agent: this.agent.id,
      claim,
      method: `${issue.title}の分析（フォールバック）`,
      query_fingerprint: `fallback_${this.agent.role}_${Date.now().toString(36)}`,
      metrics,
      segment_def: `${this.agent.name}による分析`,
      timeframe: {
        from: '2024-01-01',
        to: '2024-03-31',
      },
      confidence: 'mid' as const, // Changed from 'low' since we have actual data
      caveats: ['LLM分析が完了しなかったため、基本的な集計結果のみです。'],
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Generate discussion message about own findings
   */
  async generateFindingsMessage(card: EvidenceCard): Promise<string> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `あなたの分析結果を議会に報告してください。

分析結果:
- 主張: ${card.claim}
- 手法: ${card.method}
- 信頼度: ${card.confidence}
- 指標: ${card.metrics.map(m => `${m.name}: ${m.value}${m.unit || ''}`).join(', ')}

2-3文で簡潔に報告してください。「【分析結果報告】」で始めてください。`,
      },
    ];

    try {
      const response = await this.client.chat(messages, { temperature: 0.7 });
      return response.content;
    } catch (error) {
      return `【分析結果報告】${card.claim}`;
    }
  }

  /**
   * Generate critique/question about another agent's card
   */
  async generateCritique(targetCard: EvidenceCard, targetAgentName: string): Promise<{
    type: 'question' | 'critique' | 'support';
    content: string;
  }> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `他のアナリスト（${targetAgentName}）の分析結果をレビューしてください:

主張: ${targetCard.claim}
手法: ${targetCard.method}
信頼度: ${targetCard.confidence}
指標: ${targetCard.metrics.map(m => `${m.name}: ${m.value}${m.unit || ''}`).join(', ')}
注意点: ${targetCard.caveats.join(', ')}

あなたの専門分野の視点から、以下のいずれかの反応をしてください:
1. 質問（不明点や追加分析の提案）
2. 批評（方法論やデータ解釈への疑問）
3. 支持（同意と補強意見）

JSON形式で回答:
{
  "type": "question" | "critique" | "support",
  "content": "コメント内容（2-3文）"
}`,
      },
    ];

    try {
      const response = await this.client.chat(messages, { temperature: 0.8 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { type: 'support', content: `${targetAgentName}の分析結果は興味深いです。` };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type || 'support',
        content: parsed.content,
      };
    } catch (error) {
      return { type: 'support', content: `${targetAgentName}の分析は参考になります。` };
    }
  }

  /**
   * Generate response to a critique
   */
  async generateResponse(critique: Message, myCard: EvidenceCard, critiquerName: string): Promise<string> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `あなたの分析結果に対して${critiquerName}から以下のコメントがありました:

「${critique.content}」

あなたの分析結果:
- 主張: ${myCard.claim}
- 手法: ${myCard.method}

このコメントに対して、専門家として2-3文で回答してください。
建設的で、必要に応じて限界を認めつつ、分析の妥当性を説明してください。`,
      },
    ];

    try {
      const response = await this.client.chat(messages, { temperature: 0.7 });
      return response.content;
    } catch (error) {
      return `ご指摘ありがとうございます。${myCard.claim}という結論は、${myCard.method}に基づいています。`;
    }
  }

  private generateChartSpec(queryResults: Record<string, any[]>): ChartSpec | undefined {
    // Try to generate a chart from the first available result set
    for (const [key, results] of Object.entries(queryResults)) {
      if (results.length === 0) continue;

      const firstRow = results[0];
      const keys = Object.keys(firstRow);

      // Find a suitable label column and value column
      const labelCol = keys.find(k =>
        typeof firstRow[k] === 'string' || k.includes('date') || k.includes('month')
      );
      const valueCol = keys.find(k =>
        typeof firstRow[k] === 'number' && !k.includes('count')
      ) || keys.find(k => typeof firstRow[k] === 'number');

      if (labelCol && valueCol) {
        return {
          type: key.includes('trend') ? 'line' : 'bar',
          title: key,
          labels: results.map(r => String(r[labelCol])),
          datasets: [{
            label: valueCol,
            data: results.map(r => Number(r[valueCol]) || 0),
            backgroundColor: '#3b82f6',
            borderColor: '#2563eb',
          }],
        };
      }
    }

    return undefined;
  }
}

// ============ Chair Agent (Special) ============

export class LLMChairAgent {
  private client: LLMClient;
  public agent: Agent;

  constructor(agent: Agent, client: LLMClient) {
    this.agent = agent;
    this.client = client;
  }

  /**
   * Generate planning message
   */
  async generatePlanningMessage(
    topic: string,
    analysts: Agent[],
    contextPrompt: string = '',
    originalTopic?: string,
    iteration: number = 1
  ): Promise<string> {
    const analystList = analysts.map(a => `- ${a.name}: ${a.persona}`).join('\n');

    const iterationNote = iteration > 1
      ? `\n\n【注意】これは${iteration}回目のイテレーションです。元の分析依頼「${originalTopic}」に対する回答を深めることが目的です。前回までの分析結果を踏まえ、より具体的で実行可能な洞察を導いてください。`
      : '';

    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.chair },
      {
        role: 'user',
        content: `分析テーマ「${topic}」について議会を${iteration > 1 ? '再開' : '開始'}します。${iterationNote}${contextPrompt}

参加アナリスト:
${analystList}

議会の${iteration > 1 ? '再開' : '開始'}宣言と、各アナリストへの期待を3-4文で述べてください。
${iteration > 1 ? '前回までの分析を踏まえて、今回のイテレーションで特に深掘りすべき点を明確に指示してください。' : ''}
「【議会${iteration > 1 ? '再開' : '開始'}】」で始めてください。`,
      },
    ];

    try {
      const response = await this.client.chat(messages, { temperature: 0.7 });
      return response.content;
    } catch (error) {
      return `【議会${iteration > 1 ? '再開' : '開始'}】\n分析テーマ「${topic}」について議会を${iteration > 1 ? '再開' : '開始'}します。各アナリストは専門の視点から分析を行ってください。`;
    }
  }

  /**
   * Generate final analysis story with iteration evolution
   */
  async generateFinalReport(
    topic: string,
    cards: EvidenceCard[],
    _issues: Issue[],
    messages: Message[],
    agents: Agent[],
    iterationHistory: { roundNumber: number; theme: string; keyFindings: string[]; evaluation?: { scores: { specificity: number; novelty: number; actionClarity: number }; passed: boolean; feedback: string } }[] = []
  ): Promise<{
    analysis_story: string;
    key_findings: string[];
  }> {
    const cardSummaries = cards.map(c =>
      `- [${agents.find(a => a.id === c.author_agent)?.name || 'Unknown'}] ${c.claim} (信頼度: ${c.confidence})`
    ).join('\n');

    const discussionHighlights = messages
      .filter(m => m.type === 'critique' || m.type === 'question')
      .slice(-5)
      .map(m => `- ${m.content.substring(0, 100)}...`)
      .join('\n');

    // Build iteration history summary
    let iterationSummary = '';
    if (iterationHistory.length > 1) {
      iterationSummary = '\n【イテレーション履歴】\n';
      iterationHistory.forEach((round) => {
        iterationSummary += `▼ イテレーション${round.roundNumber}: ${round.theme}\n`;
        if (round.keyFindings.length > 0) {
          iterationSummary += `  発見: ${round.keyFindings.slice(0, 2).join('; ')}\n`;
        }
        if (round.evaluation) {
          iterationSummary += `  評価: 具体性${round.evaluation.scores.specificity}/5, 新規性${round.evaluation.scores.novelty}/5, アクション明瞭さ${round.evaluation.scores.actionClarity}/5\n`;
          if (!round.evaluation.passed) {
            iterationSummary += `  改善点: ${round.evaluation.feedback}\n`;
          }
        }
      });
    }

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.chair },
      {
        role: 'user',
        content: `分析テーマ「${topic}」の議会が終了しました。${iterationHistory.length > 1 ? `${iterationHistory.length}回のイテレーションを経て分析を深めました。` : ''}
${iterationSummary}
【エビデンスカード一覧】
${cardSummaries}

【議論のハイライト】
${discussionHighlights || 'なし'}

最終レポートを作成してください:

JSON形式で回答:
{
  "analysis_story": "分析ストーリー（マークダウン形式、800-1200文字程度）",
  "key_findings": ["主要な発見1", "主要な発見2", "主要な発見3", "主要な発見4", "主要な発見5"]
}

analysis_storyには以下を含めてください:
- # タイトル（元のお題に対する回答として）
- ## 概要（分析の目的と範囲）
${iterationHistory.length > 1 ? '- ## イテレーションによる分析進化（各イテレーションでどう洞察が深まったか）' : ''}
- ## 主要な発見（具体的なデータと共に）
- ## 結論と推奨事項（具体的で実行可能なアクション）

【重要】元のお題「${topic}」に対する明確な回答となるようにまとめてください。`,
      },
    ];

    try {
      const response = await this.client.chat(llmMessages, { temperature: 0.6, maxTokens: 3000 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON not found');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('[LLMChairAgent] Error generating report:', error);

      // Generate a more detailed fallback report
      const iterationSection = iterationHistory.length > 1
        ? `\n\n## イテレーションによる分析進化\n\n本分析は${iterationHistory.length}回のイテレーションを経て深化しました。\n\n${iterationHistory.map(r => `### イテレーション${r.roundNumber}: ${r.theme}\n${r.keyFindings.slice(0, 2).map(f => `- ${f}`).join('\n')}`).join('\n\n')}`
        : '';

      return {
        analysis_story: `# 分析レポート: ${topic}\n\n## 概要\n分析議会にて${cards.length}件のエビデンスが収集されました。${iterationHistory.length > 1 ? `${iterationHistory.length}回のイテレーションを経て分析を深めました。` : ''}${iterationSection}\n\n## 主要な発見\n${cards.map(c => `- ${c.claim}`).join('\n')}\n\n## 結論と推奨事項\n詳細な分析により、有益な洞察が得られました。具体的なアクションの検討を推奨します。`,
        key_findings: cards.slice(0, 5).map(c => c.claim),
      };
    }
  }
}

// ============ Query execution helper ============

export async function executeAnalysisQueries(role: string): Promise<Record<string, any[]>> {
  const roleQueryMap: Record<string, AnalysisQueryKey[]> = {
    growth_analyst: ['monthlyTrend', 'storePerformance', 'totalSales', 'salesByCategory'],
    segment_analyst: ['customerSegments', 'customerLTV', 'priceRangeAnalysis'],
    basket_analyst: ['basketSize', 'categoryCoPurchase', 'topProducts'],
    seasonality_analyst: ['dayOfWeekPattern', 'monthlyTrend', 'salesByCategory'],
  };

  const queries = roleQueryMap[role] || ['totalSales'];
  const results: Record<string, any[]> = {};
  let successCount = 0;

  for (const queryKey of queries) {
    try {
      const query = ANALYSIS_QUERIES[queryKey];
      if (!query) {
        console.warn(`[executeAnalysisQueries] Query not found: ${queryKey}`);
        continue;
      }
      const data = await executeQuery(query);
      if (data && Array.isArray(data)) {
        results[queryKey] = data;
        successCount++;
      }
    } catch (error) {
      console.error(`[executeAnalysisQueries] Error executing ${queryKey}:`, error);
      // Continue with other queries even if one fails
    }
  }

  // If no queries succeeded, try a simple fallback query
  if (successCount === 0) {
    console.warn(`[executeAnalysisQueries] No queries succeeded for ${role}, trying fallback`);
    try {
      const fallbackData = await executeQuery(ANALYSIS_QUERIES.totalSales);
      if (fallbackData && Array.isArray(fallbackData)) {
        results['totalSales'] = fallbackData;
      }
    } catch (fallbackError) {
      console.error('[executeAnalysisQueries] Fallback query also failed:', fallbackError);
    }
  }

  return results;
}
