// =============================================
// DEMO Mode Agents - Rule-based Implementation
// =============================================

import type {
  Agent,
  AgentRole,
  Confidence,
  EvidenceCard,
  Issue,
  Message,
  MessageType,
  ChartSpec,
} from '../types';
import { executeQuery, generateQueryFingerprint, ANALYSIS_QUERIES } from '../utils/duckdb';
import { generateId } from './protocol';

// ============ Analysis Templates ============

interface AnalysisTemplate {
  role: AgentRole;
  issueTemplates: {
    title: string;
    description: string;
    why_it_matters: string;
    hypotheses: string[];
    queryKey: keyof typeof ANALYSIS_QUERIES;
  }[];
}

const ANALYSIS_TEMPLATES: AnalysisTemplate[] = [
  {
    role: 'growth_analyst',
    issueTemplates: [
      {
        title: '売上トレンドの把握',
        description: '月次での売上推移を分析し、成長傾向を明らかにする',
        why_it_matters: '事業成長の方向性と速度を理解することで、戦略的意思決定の基盤を作る',
        hypotheses: [
          '売上は安定的に成長している',
          '特定の月に売上が集中している',
          '季節変動のパターンがある',
        ],
        queryKey: 'monthlyTrend',
      },
      {
        title: '店舗パフォーマンス比較',
        description: '各店舗の売上貢献度と顧客数を比較分析する',
        why_it_matters: '店舗ごとの強み・弱みを把握し、リソース配分の最適化につなげる',
        hypotheses: [
          '店舗間で顧客単価に差がある',
          '特定店舗に顧客が偏っている',
          '店舗ごとに売れ筋部門が異なる',
        ],
        queryKey: 'storePerformance',
      },
    ],
  },
  {
    role: 'segment_analyst',
    issueTemplates: [
      {
        title: '顧客セグメントの特定',
        description: '購買頻度に基づいて顧客をセグメント化し、各セグメントの特性を分析',
        why_it_matters: 'セグメント別のアプローチを設計し、顧客価値の最大化を図る',
        hypotheses: [
          'ロイヤル層の購買単価は高い',
          '新規顧客が多数を占める',
          'セグメント間で購買頻度に大きな差がある',
        ],
        queryKey: 'customerSegments',
      },
      {
        title: '顧客LTV分析',
        description: '顧客生涯価値の分布を分析し、高価値顧客の特徴を把握',
        why_it_matters: '顧客獲得・維持コストの最適化と優良顧客育成施策の立案',
        hypotheses: [
          '上位20%の顧客が売上の大半を占める',
          '高LTV顧客は特定部門の購買率が高い',
        ],
        queryKey: 'customerLTV',
      },
    ],
  },
  {
    role: 'basket_analyst',
    issueTemplates: [
      {
        title: 'バスケット構成の分析',
        description: '1回の購買あたりの商品数と購買額の関係を分析',
        why_it_matters: 'クロスセル機会の発見とバスケットサイズ拡大施策の検討',
        hypotheses: [
          'バスケットサイズと購買額は正の相関がある',
          '5点以上購入の顧客は客単価が高い',
        ],
        queryKey: 'basketSize',
      },
      {
        title: '部門併買パターン',
        description: '同一トランザクションで購入される部門の組み合わせを分析',
        why_it_matters: '売場配置やプロモーション設計に活用できる知見を得る',
        hypotheses: [
          '青果と精肉は一緒に購入されやすい',
          'デイリーと加工食品の併買率が高い',
          '家庭用品は他部門との併買率が低い',
        ],
        queryKey: 'categoryCoPurchase',
      },
    ],
  },
  {
    role: 'seasonality_analyst',
    issueTemplates: [
      {
        title: '曜日別購買パターン',
        description: '曜日ごとの購買傾向を分析し、週内の変動を把握',
        why_it_matters: 'シフト計画やプロモーションタイミングの最適化',
        hypotheses: [
          '週末は購買が増加する',
          '平日と週末で購買部門に差がある',
          '金曜日は週間で最も売上が高い',
        ],
        queryKey: 'dayOfWeekPattern',
      },
      {
        title: '部門別売上構成分析',
        description: '各部門の売上構成比と特徴を分析',
        why_it_matters: '部門ごとの戦略立案と売場面積配分の最適化',
        hypotheses: [
          '生鮮三部門（青果・鮮魚・精肉）で売上の過半を占める',
          '部門によって客単価に大きな差がある',
          '加工食品は購買頻度が高い',
        ],
        queryKey: 'salesByCategory',
      },
    ],
  },
];

// ============ Helper Functions ============

function getTemplateForRole(role: AgentRole): AnalysisTemplate | undefined {
  return ANALYSIS_TEMPLATES.find((t) => t.role === role);
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function assessConfidence(dataPoints: number): Confidence {
  // dataPoints should be actual transaction count, not aggregated row count
  if (dataPoints < 100) return 'low';
  if (dataPoints < 1000) return 'mid';
  return 'high';
}

/**
 * Calculate actual transaction count from aggregated query results
 * Different queries store counts in different fields
 */
function calculateActualCount(
  queryKey: keyof typeof ANALYSIS_QUERIES,
  results: Record<string, unknown>[]
): number {
  if (results.length === 0) return 0;

  switch (queryKey) {
    case 'totalSales':
      // Has direct transaction_count
      return Number(results[0].transaction_count) || 0;

    case 'monthlyTrend':
    case 'dayOfWeekPattern':
    case 'salesByCategory':
      // Sum of transactions field
      return results.reduce((sum, r) => sum + (Number(r.transactions) || 0), 0);

    case 'storePerformance':
    case 'salesByStore':
      // Sum of transactions field
      return results.reduce((sum, r) => sum + (Number(r.transactions) || 0), 0);

    case 'customerSegments':
    case 'customerLTV':
      // Sum of customer_count (this is customer count, use for reference)
      return results.reduce((sum, r) => sum + (Number(r.customer_count) || 0), 0);

    case 'basketSize':
      // Sum of transaction_count field
      return results.reduce((sum, r) => sum + (Number(r.transaction_count) || 0), 0);

    case 'categoryCoPurchase':
      // Sum of co_occurrence_count
      return results.reduce((sum, r) => sum + (Number(r.co_occurrence_count) || 0), 0);

    case 'priceRangeAnalysis':
      // Sum of transaction_count field
      return results.reduce((sum, r) => sum + (Number(r.transaction_count) || 0), 0);

    case 'topProducts':
      // Sum of purchase_count field
      return results.reduce((sum, r) => sum + (Number(r.purchase_count) || 0), 0);

    default:
      // Fallback: try common field names
      const firstRow = results[0];
      if ('transaction_count' in firstRow) {
        return results.reduce((sum, r) => sum + (Number(r.transaction_count) || 0), 0);
      }
      if ('transactions' in firstRow) {
        return results.reduce((sum, r) => sum + (Number(r.transactions) || 0), 0);
      }
      if ('customer_count' in firstRow) {
        return results.reduce((sum, r) => sum + (Number(r.customer_count) || 0), 0);
      }
      // Last resort: return row count (but this is often misleading)
      return results.length;
  }
}

// ============ Demo Agent Implementation ============

export class DemoAgent {
  constructor(public agent: Agent) {}

  /**
   * Generate issues based on the analysis topic
   */
  async generateIssues(topic: string): Promise<Issue[]> {
    const template = getTemplateForRole(this.agent.role);
    if (!template) return [];

    return template.issueTemplates.map((t) => ({
      id: generateId(),
      title: t.title,
      description: `${t.description}\n\n【お題との関連】${topic}`,
      why_it_matters: t.why_it_matters,
      hypotheses: t.hypotheses,
      required_cards: ['evidence'],
      status: 'open' as const,
      assigned_to: this.agent.id,
    }));
  }

  /**
   * Perform analysis and generate evidence cards
   */
  async analyzeIssue(issue: Issue): Promise<EvidenceCard[]> {
    const template = getTemplateForRole(this.agent.role);

    // Try to find matching template
    let issueTemplate = template?.issueTemplates.find(
      (t) => t.title === issue.title
    );

    // If no exact match, use the first template for this role (fallback)
    if (!issueTemplate && template && template.issueTemplates.length > 0) {
      issueTemplate = template.issueTemplates[0];
      console.log(`[DemoAgent] No exact template match for "${issue.title}", using fallback template`);
    }

    // If still no template, create a generic card
    if (!issueTemplate) {
      console.warn(`[DemoAgent] No template for role ${this.agent.role}, creating generic card`);
      return [this.createGenericCard(issue)];
    }

    try {
      const query = ANALYSIS_QUERIES[issueTemplate.queryKey];
      const results = await executeQuery<Record<string, unknown>>(query);

      if (results.length === 0) {
        console.warn(`[DemoAgent] No results for query ${issueTemplate.queryKey}, creating generic card`);
        return [this.createGenericCard(issue)];
      }

      // Generate chart spec based on query type
      const chartSpec = this.generateChartSpec(issueTemplate.queryKey, results);

      // Extract metrics from results
      const metrics = this.extractMetrics(issueTemplate.queryKey, results);

      // Get timeframe
      let timeframe = { start_date: '2024-01-01', end_date: '2024-03-31' };
      try {
        const timeframeResult = await executeQuery<{
          start_date: string;
          end_date: string;
        }>(ANALYSIS_QUERIES.timeframeSummary);
        if (timeframeResult && timeframeResult[0]) {
          timeframe = timeframeResult[0];
        }
      } catch (e) {
        console.warn('[DemoAgent] Failed to get timeframe, using default');
      }

      const card: EvidenceCard = {
        id: generateId(),
        author_agent: this.agent.id,
        claim: this.generateClaim(issueTemplate.queryKey, results),
        method: `${issue.title}の分析を実施。DuckDB-Wasmによる集計クエリを実行。`,
        query_fingerprint: generateQueryFingerprint(query),
        metrics,
        segment_def: this.getSegmentDef(issueTemplate.queryKey),
        timeframe: {
          from: String(timeframe.start_date).split('T')[0],
          to: String(timeframe.end_date).split('T')[0],
        },
        chart_spec: chartSpec,
        confidence: assessConfidence(calculateActualCount(issueTemplate.queryKey, results)),
        caveats: this.generateCaveats(issueTemplate.queryKey, results),
        created_at: new Date().toISOString(),
      };

      return [card];
    } catch (error) {
      console.error(`[DemoAgent] Error in analyzeIssue:`, error);
      return [this.createGenericCard(issue)];
    }
  }

  /**
   * Create a generic card when template matching fails
   */
  private createGenericCard(issue: Issue): EvidenceCard {
    return {
      id: generateId(),
      author_agent: this.agent.id,
      claim: `${issue.title}に関する分析を実施しました。`,
      method: `${this.agent.name}による分析`,
      query_fingerprint: `generic_${this.agent.role}_${Date.now().toString(36)}`,
      metrics: [{ name: 'データ件数', value: '-', unit: '' }],
      segment_def: '全データ対象',
      timeframe: {
        from: '2024-01-01',
        to: '2024-03-31',
      },
      confidence: 'low' as Confidence,
      caveats: ['テンプレートマッチングに失敗したため、汎用的な分析結果です。'],
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Generate discussion messages
   */
  generateDiscussionMessages(
    cards: EvidenceCard[],
    otherAgentCards: EvidenceCard[]
  ): Omit<Message, 'id' | 'ts'>[] {
    const messages: Omit<Message, 'id' | 'ts'>[] = [];

    // Comment on own findings
    if (cards.length > 0) {
      const myCard = cards[0];
      messages.push({
        speaker: this.agent.id,
        type: 'proposal' as MessageType,
        content: `【分析結果報告】${myCard.claim}`,
        ref_cards: [myCard.id],
      });
    }

    // Comment on other agents' findings
    if (otherAgentCards.length > 0) {
      const targetCard = randomChoice(otherAgentCards);
      const messageTypes: { type: MessageType; templates: string[] }[] = [
        {
          type: 'support',
          templates: [
            `${targetCard.claim}という知見は、私の分析結果とも整合しています。`,
            `この結果は重要な示唆を含んでいると考えます。`,
          ],
        },
        {
          type: 'question',
          templates: [
            `この結果について、セグメント別の内訳はどうなっていますか？`,
            `時系列での変化は見られますか？`,
          ],
        },
        {
          type: 'critique',
          templates: [
            `サンプルサイズが限定的な点に注意が必要かもしれません。`,
            `他の要因の影響も検討すべきではないでしょうか。`,
          ],
        },
      ];

      const choice = randomChoice(messageTypes);
      messages.push({
        speaker: this.agent.id,
        type: choice.type,
        content: randomChoice(choice.templates),
        ref_cards: [targetCard.id],
      });
    }

    return messages;
  }

  // ============ Private Helpers ============

  private generateChartSpec(
    queryKey: keyof typeof ANALYSIS_QUERIES,
    results: Record<string, unknown>[]
  ): ChartSpec | undefined {
    switch (queryKey) {
      case 'monthlyTrend':
        return {
          type: 'line',
          title: '月別売上推移',
          labels: results.map((r) => String(r.month)),
          datasets: [
            {
              label: '売上',
              data: results.map((r) => Number(r.revenue)),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
            },
          ],
        };

      case 'salesByStore':
      case 'storePerformance':
        return {
          type: 'bar',
          title: '店舗別売上',
          labels: results.map((r) => String(r.store)),
          datasets: [
            {
              label: '売上',
              data: results.map((r) => Number(r.revenue || r.total_revenue)),
              backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
            },
          ],
        };

      case 'salesByCategory':
        return {
          type: 'doughnut',
          title: 'カテゴリ別売上構成',
          labels: results.map((r) => String(r.category)),
          datasets: [
            {
              label: '売上',
              data: results.map((r) => Number(r.revenue)),
              backgroundColor: [
                '#3b82f6',
                '#10b981',
                '#f59e0b',
                '#ef4444',
                '#8b5cf6',
                '#ec4899',
              ],
            },
          ],
        };

      case 'customerSegments':
        return {
          type: 'bar',
          title: '顧客セグメント分布',
          labels: results.map((r) => String(r.segment)),
          datasets: [
            {
              label: '顧客数',
              data: results.map((r) => Number(r.customer_count)),
              backgroundColor: '#3b82f6',
            },
          ],
        };

      case 'dayOfWeekPattern':
        return {
          type: 'bar',
          title: '曜日別売上',
          labels: results.map((r) => String(r.day_name)),
          datasets: [
            {
              label: '売上',
              data: results.map((r) => Number(r.revenue)),
              backgroundColor: '#10b981',
            },
          ],
        };

      case 'basketSize':
        return {
          type: 'bar',
          title: 'バスケットサイズ分布',
          labels: results.map((r) => `${r.items_in_basket}点`),
          datasets: [
            {
              label: '取引数',
              data: results.map((r) => Number(r.transaction_count)),
              backgroundColor: '#8b5cf6',
            },
          ],
        };

      default:
        return undefined;
    }
  }

  private extractMetrics(
    queryKey: keyof typeof ANALYSIS_QUERIES,
    results: Record<string, unknown>[]
  ): { name: string; value: number | string; unit?: string }[] {
    const metrics: { name: string; value: number | string; unit?: string }[] = [];

    if (results.length === 0) return metrics;

    switch (queryKey) {
      case 'totalSales':
        metrics.push(
          { name: '総取引数', value: Number(results[0].transaction_count), unit: '件' },
          { name: '総売上', value: Number(results[0].total_revenue), unit: '円' },
          { name: '平均取引額', value: Math.round(Number(results[0].avg_transaction_value)), unit: '円' },
          { name: 'ユニーク顧客数', value: Number(results[0].unique_customers), unit: '人' }
        );
        break;

      case 'monthlyTrend':
        const revenues = results.map((r) => Number(r.revenue));
        const maxRevenue = Math.max(...revenues);
        const minRevenue = Math.min(...revenues);
        metrics.push(
          { name: '最高月売上', value: maxRevenue, unit: '円' },
          { name: '最低月売上', value: minRevenue, unit: '円' },
          { name: '変動幅', value: Math.round(((maxRevenue - minRevenue) / minRevenue) * 100), unit: '%' }
        );
        break;

      case 'customerSegments':
        const totalCustomers = results.reduce((sum, r) => sum + Number(r.customer_count), 0);
        results.forEach((r) => {
          metrics.push({
            name: `${r.segment}顧客数`,
            value: Number(r.customer_count),
            unit: `人 (${Math.round((Number(r.customer_count) / totalCustomers) * 100)}%)`,
          });
        });
        break;

      case 'storePerformance':
        results.forEach((r) => {
          metrics.push({
            name: `${r.store}売上`,
            value: Number(r.total_revenue),
            unit: '円',
          });
        });
        break;

      default:
        // Generic: calculate actual count from query results
        const actualCount = calculateActualCount(queryKey, results);
        metrics.push({ name: 'データ件数', value: actualCount.toLocaleString(), unit: '件' });
    }

    return metrics;
  }

  private generateClaim(
    queryKey: keyof typeof ANALYSIS_QUERIES,
    results: Record<string, unknown>[]
  ): string {
    if (results.length === 0) return 'データが不足しており、分析結果を得られませんでした。';

    switch (queryKey) {
      case 'monthlyTrend': {
        const revenues = results.map((r) => Number(r.revenue));
        const isGrowing = revenues[revenues.length - 1] > revenues[0];
        return isGrowing
          ? '分析期間中、売上は増加傾向にあります。特に後半月での成長が顕著です。'
          : '売上は横ばいまたは微減傾向にあり、成長施策の検討が必要と考えられます。';
      }

      case 'customerSegments': {
        const newCustomer = results.find((r) => r.segment === '新規顧客');
        const loyal = results.find((r) => r.segment === 'ロイヤル層');
        const totalCustomers = results.reduce((sum, r) => sum + Number(r.customer_count), 0);
        if (newCustomer) {
          const newRatio = Math.round((Number(newCustomer.customer_count) / totalCustomers) * 100);
          if (newRatio > 30) {
            return `新規顧客が全体の${newRatio}%を占めており、リピート率向上が課題です。ロイヤル層育成施策を検討すべきです。`;
          }
        }
        if (loyal) {
          const loyalAvgSpent = Math.round(Number(loyal.avg_spent));
          return `ロイヤル層の平均購買額は${loyalAvgSpent.toLocaleString()}円と高く、優良顧客の維持が重要です。`;
        }
        return '顧客セグメントは比較的バランスが取れていますが、各セグメント向けの施策最適化の余地があります。';
      }

      case 'customerLTV': {
        const highLTV = results.find((r) => r.ltv_range === '10万円以上');
        const totalCustomers = results.reduce((sum, r) => sum + Number(r.customer_count), 0);
        if (highLTV) {
          const highRatio = Math.round((Number(highLTV.customer_count) / totalCustomers) * 100);
          return `高LTV顧客（10万円以上）は全体の${highRatio}%ですが、売上への貢献度は大きいと推測されます。`;
        }
        return '顧客LTVの分布を分析しました。上位顧客への重点施策が効果的と考えられます。';
      }

      case 'salesByCategory': {
        const sorted = [...results].sort((a, b) => Number(b.revenue) - Number(a.revenue));
        const top = sorted[0];
        const totalRevenue = results.reduce((sum, r) => sum + Number(r.revenue), 0);
        const topRatio = Math.round((Number(top.revenue) / totalRevenue) * 100);
        return `${top.category}部門が売上トップで全体の${topRatio}%を占めています。生鮮部門の強化が売上向上の鍵です。`;
      }

      case 'storePerformance': {
        const topStore = results[0];
        return `${topStore.store}店が売上トップで、全体の${Math.round(
          (Number(topStore.total_revenue) /
            results.reduce((sum, r) => sum + Number(r.total_revenue), 0)) *
            100
        )}%を占めています。`;
      }

      case 'dayOfWeekPattern': {
        const sorted = [...results].sort((a, b) => Number(b.revenue) - Number(a.revenue));
        return `${sorted[0].day_name}の売上が最も高く、${sorted[sorted.length - 1].day_name}が最も低い傾向があります。`;
      }

      case 'basketSize': {
        const avgItems =
          results.reduce((sum, r) => sum + Number(r.items_in_basket) * Number(r.transaction_count), 0) /
          results.reduce((sum, r) => sum + Number(r.transaction_count), 0);
        return `平均バスケットサイズは${avgItems.toFixed(1)}点です。複数商品購入時の単価が高い傾向があります。`;
      }

      case 'categoryCoPurchase': {
        if (results.length > 0) {
          const top = results[0];
          return `${top.category_a}と${top.category_b}の併買が最も多く見られます（${top.co_occurrence_count}件）。`;
        }
        return '明確な併買パターンは検出されませんでした。';
      }

      default:
        return `${results.length}件のデータポイントを分析し、有意な傾向を確認しました。`;
    }
  }

  private getSegmentDef(queryKey: keyof typeof ANALYSIS_QUERIES): string {
    switch (queryKey) {
      case 'customerSegments':
        return '購買回数に基づくセグメント: 新規顧客(1回), ライト層(2-10回), ミドル層(11-30回), ヘビー層(31-60回), ロイヤル層(61回以上)';
      case 'customerLTV':
        return '顧客生涯価値（累計購買額）に基づく分布';
      case 'monthlyTrend':
        return '全顧客・全部門対象の月次集計';
      case 'storePerformance':
        return '店舗別の全部門売上';
      case 'dayOfWeekPattern':
        return '曜日別の全店舗集計';
      case 'basketSize':
        return 'トランザクション単位でのバスケット分析';
      case 'categoryCoPurchase':
        return '同一トランザクション内での部門併買';
      case 'salesByCategory':
        return '部門別（青果・鮮魚・精肉・加工食品・デイリー・菓子・家庭用品）の売上分析';
      default:
        return '全データ対象';
    }
  }

  private generateCaveats(
    queryKey: keyof typeof ANALYSIS_QUERIES,
    results: Record<string, unknown>[]
  ): string[] {
    const caveats: string[] = [];

    // Use actual transaction count, not aggregated row count
    const actualCount = calculateActualCount(queryKey, results);
    if (actualCount < 100) {
      caveats.push('サンプルサイズが限定的です。結果の解釈には注意が必要です。');
    }

    switch (queryKey) {
      case 'monthlyTrend':
        caveats.push('季節要因の影響を除外していません。');
        caveats.push('外部要因（プロモーション等）は考慮していません。');
        break;
      case 'customerSegments':
        caveats.push('新規顧客とリピート顧客の定義は購買回数のみに基づいています。');
        break;
      case 'basketSize':
        caveats.push('商品カテゴリの違いは考慮していません。');
        break;
    }

    return caveats;
  }
}

// ============ Chair Agent (Special) ============

export class DemoChairAgent {
  constructor(public agent: Agent) {}

  /**
   * Generate the planning message
   */
  generatePlanningMessage(topic: string, analysts: Agent[]): Omit<Message, 'id' | 'ts'> {
    const analystNames = analysts.map((a) => a.name).join('、');
    return {
      speaker: this.agent.id,
      type: 'proposal' as MessageType,
      content: `【議会開始】\n分析テーマ: 「${topic}」\n\n本議会では以下のアナリストが分析を担当します:\n${analystNames}\n\n各アナリストは専門の視点から論点を設定し、データ分析を実施します。結果が出揃い次第、議論フェーズに移行します。`,
    };
  }

  /**
   * Generate transition messages
   */
  generateTransitionMessage(phase: string): Omit<Message, 'id' | 'ts'> {
    const messages: Record<string, string> = {
      analyzing: '【分析フェーズ開始】各アナリストが担当論点の分析を開始します。',
      council: '【議論フェーズ開始】全アナリストの分析結果が出揃いました。議論を開始します。',
      finalize: '【総括フェーズ】議論を踏まえ、最終的な分析ストーリーをまとめます。',
    };

    return {
      speaker: this.agent.id,
      type: 'system' as MessageType,
      content: messages[phase] || `【${phase}フェーズ】`,
    };
  }

  /**
   * Generate final analysis story
   */
  generateFinalReport(
    topic: string,
    cards: EvidenceCard[],
    issues: Issue[],
    messages: Message[],
    agents: Agent[],
    startTime: string
  ): {
    analysis_story: string;
    key_findings: string[];
    minutes: {
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
  } {
    // Collect key findings from cards
    const keyFindings = cards
      .filter((c) => c.confidence !== 'low')
      .map((c) => c.claim)
      .slice(0, 5);

    // Build analysis story
    const story = this.buildAnalysisStory(topic, cards, keyFindings);

    // Calculate duration
    const durationSeconds = Math.round(
      (new Date().getTime() - new Date(startTime).getTime()) / 1000
    );

    // Build discussion points
    const discussionPoints = issues.map((issue) => {
      const relatedCards = cards.filter((c) => c.author_agent === issue.assigned_to);
      const relatedMessages = messages.filter(
        (m) => m.ref_cards?.some((cid) => relatedCards.map((c) => c.id).includes(cid)) ||
               m.ref_issues?.includes(issue.id)
      );

      return {
        issue_id: issue.id,
        issue_title: issue.title,
        messages: relatedMessages,
        conclusion: relatedCards[0]?.claim || '分析継続中',
      };
    });

    return {
      analysis_story: story,
      key_findings: keyFindings,
      minutes: {
        summary: `「${topic}」に関する分析議会を実施しました。${agents.length}名のエージェントが参加し、${cards.length}件のエビデンスカードが提出されました。`,
        key_findings: keyFindings,
        discussion_points: discussionPoints,
        participants: agents.map((a) => a.name),
        duration_seconds: durationSeconds,
      },
    };
  }

  private buildAnalysisStory(
    topic: string,
    cards: EvidenceCard[],
    keyFindings: string[]
  ): string {
    const sections = [
      `# 分析ストーリー: ${topic}\n`,
      `## 概要\n本分析では、購買履歴データを多角的に分析し、${topic}に関する知見を導出しました。\n`,
      `## 主要な発見\n${keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`,
      `## 詳細分析\n`,
    ];

    // Group cards by author
    const cardsByAuthor = cards.reduce((acc, card) => {
      if (!acc[card.author_agent]) acc[card.author_agent] = [];
      acc[card.author_agent].push(card);
      return acc;
    }, {} as Record<string, EvidenceCard[]>);

    Object.entries(cardsByAuthor).forEach(([, agentCards]) => {
      agentCards.forEach((card) => {
        sections.push(`### ${card.claim}\n`);
        sections.push(`- 分析手法: ${card.method}\n`);
        sections.push(`- セグメント: ${card.segment_def}\n`);
        sections.push(`- 信頼度: ${card.confidence}\n`);
        if (card.metrics.length > 0) {
          sections.push(`- 主要指標:\n`);
          card.metrics.forEach((m) => {
            sections.push(`  - ${m.name}: ${m.value}${m.unit || ''}\n`);
          });
        }
        if (card.caveats.length > 0) {
          sections.push(`- 注意点: ${card.caveats.join('; ')}\n`);
        }
        sections.push('\n');
      });
    });

    sections.push(`## 結論と推奨事項\n`);
    sections.push(`本分析から、以下のアクションを推奨します:\n`);
    sections.push(`1. データに基づく顧客セグメント別施策の検討\n`);
    sections.push(`2. 店舗パフォーマンス差異の要因分析と横展開\n`);
    sections.push(`3. 併買パターンを活用したクロスセル施策の実施\n`);

    return sections.join('');
  }
}
