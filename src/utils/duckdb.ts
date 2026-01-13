// =============================================
// DuckDB-Wasm Integration
// =============================================

import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize DuckDB-Wasm
 */
export async function initDuckDB(): Promise<void> {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

    // Select a bundle based on browser capabilities
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], {
        type: 'text/javascript',
      })
    );

    // Instantiate the asynchronous version of DuckDB-Wasm
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);

    conn = await db.connect();
    console.log('[DuckDB] Initialized successfully');
  })();

  return initPromise;
}

/**
 * Get the DuckDB connection
 */
export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!conn) {
    await initDuckDB();
  }
  return conn!;
}

/**
 * Load CSV data into a table
 */
export async function loadCSV(
  tableName: string,
  csvUrl: string
): Promise<void> {
  const connection = await getConnection();

  // Fetch CSV content
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.statusText}`);
  }
  const csvContent = await response.text();

  // Register the CSV content and create table
  await db!.registerFileText(`${tableName}.csv`, csvContent);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} AS
    SELECT * FROM read_csv_auto('${tableName}.csv')
  `);

  console.log(`[DuckDB] Loaded table: ${tableName}`);
}

/**
 * Execute a query and return results
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const connection = await getConnection();
  const result = await connection.query(sql);
  return result.toArray().map((row) => row.toJSON() as T);
}

/**
 * Generate a fingerprint/hash for a query
 * This is used to reference queries without exposing full SQL
 */
export function generateQueryFingerprint(sql: string): string {
  // Simple hash function for demo purposes
  let hash = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Extract key parts for summary
  const selectMatch = sql.match(/SELECT\s+(.{0,30})/i);
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  const whereMatch = sql.match(/WHERE\s+(.{0,20})/i);
  const groupMatch = sql.match(/GROUP BY\s+(.{0,20})/i);

  const summary = [
    selectMatch ? `sel:${selectMatch[1].trim().substring(0, 15)}...` : '',
    fromMatch ? `from:${fromMatch[1]}` : '',
    whereMatch ? `where:${whereMatch[1].trim().substring(0, 15)}...` : '',
    groupMatch ? `grp:${groupMatch[1].trim().substring(0, 15)}...` : '',
  ].filter(Boolean).join('|');

  return `${Math.abs(hash).toString(16).substring(0, 8)}_${summary}`;
}

/**
 * Get table schema
 */
export async function getTableSchema(
  tableName: string
): Promise<{ column_name: string; column_type: string }[]> {
  const connection = await getConnection();
  const result = await connection.query(`DESCRIBE ${tableName}`);
  return result.toArray().map((row) => {
    const json = row.toJSON() as Record<string, unknown>;
    return {
      column_name: String(json.column_name),
      column_type: String(json.column_type),
    };
  });
}

/**
 * Check if a table exists
 */
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const connection = await getConnection();
    await connection.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-defined analysis queries
 * These are safe, aggregated queries that don't expose raw data
 */
export const ANALYSIS_QUERIES = {
  // Sales overview
  totalSales: `
    SELECT
      COUNT(*) as transaction_count,
      SUM(amount) as total_revenue,
      AVG(amount) as avg_transaction_value,
      COUNT(DISTINCT member_id) as unique_customers,
      COUNT(DISTINCT transaction_id) as total_transactions
    FROM purchase_history
  `,

  // Sales by store
  salesByStore: `
    SELECT
      store,
      COUNT(*) as transactions,
      SUM(amount) as revenue,
      AVG(amount) as avg_value,
      COUNT(DISTINCT member_id) as unique_customers
    FROM purchase_history
    GROUP BY store
    ORDER BY revenue DESC
  `,

  // Sales by category (department)
  salesByCategory: `
    SELECT
      category,
      COUNT(*) as transactions,
      SUM(amount) as revenue,
      SUM(qty) as total_qty,
      AVG(amount) as avg_amount
    FROM purchase_history
    GROUP BY category
    ORDER BY revenue DESC
  `,

  // Monthly trend
  monthlyTrend: `
    SELECT
      strftime(purchase_date, '%Y-%m') as month,
      COUNT(*) as transactions,
      SUM(amount) as revenue,
      COUNT(DISTINCT member_id) as unique_customers,
      COUNT(DISTINCT transaction_id) as basket_count,
      AVG(amount) as avg_item_value
    FROM purchase_history
    GROUP BY strftime(purchase_date, '%Y-%m')
    ORDER BY month
  `,

  // Day of week analysis (Japanese labels)
  dayOfWeekPattern: `
    SELECT
      dayofweek(purchase_date) as dow,
      CASE dayofweek(purchase_date)
        WHEN 0 THEN '日曜日'
        WHEN 1 THEN '月曜日'
        WHEN 2 THEN '火曜日'
        WHEN 3 THEN '水曜日'
        WHEN 4 THEN '木曜日'
        WHEN 5 THEN '金曜日'
        WHEN 6 THEN '土曜日'
      END as day_name,
      COUNT(*) as transactions,
      SUM(amount) as revenue,
      COUNT(DISTINCT member_id) as unique_customers
    FROM purchase_history
    GROUP BY dayofweek(purchase_date)
    ORDER BY dow
  `,

  // Customer segments by purchase frequency (Japanese labels)
  customerSegments: `
    SELECT
      CASE
        WHEN purchase_count = 1 THEN '新規顧客'
        WHEN purchase_count BETWEEN 2 AND 10 THEN 'ライト層'
        WHEN purchase_count BETWEEN 11 AND 30 THEN 'ミドル層'
        WHEN purchase_count BETWEEN 31 AND 60 THEN 'ヘビー層'
        ELSE 'ロイヤル層'
      END as segment,
      COUNT(*) as customer_count,
      AVG(total_spent) as avg_spent,
      AVG(purchase_count) as avg_purchase_count
    FROM (
      SELECT
        member_id,
        COUNT(*) as purchase_count,
        SUM(amount) as total_spent
      FROM purchase_history
      GROUP BY member_id
    )
    GROUP BY segment
    ORDER BY avg_spent DESC
  `,

  // Basket analysis (items per transaction)
  basketSize: `
    SELECT
      items_in_basket,
      COUNT(*) as transaction_count,
      AVG(basket_value) as avg_basket_value,
      SUM(basket_value) as total_value
    FROM (
      SELECT
        transaction_id,
        COUNT(*) as items_in_basket,
        SUM(amount) as basket_value
      FROM purchase_history
      GROUP BY transaction_id
    )
    GROUP BY items_in_basket
    ORDER BY items_in_basket
  `,

  // Category co-occurrence (which departments are bought together)
  categoryCoPurchase: `
    SELECT
      a.category as category_a,
      b.category as category_b,
      COUNT(DISTINCT a.transaction_id) as co_occurrence_count
    FROM purchase_history a
    JOIN purchase_history b
      ON a.transaction_id = b.transaction_id
      AND a.category < b.category
    GROUP BY a.category, b.category
    HAVING COUNT(DISTINCT a.transaction_id) > 100
    ORDER BY co_occurrence_count DESC
    LIMIT 15
  `,

  // Price sensitivity analysis
  priceRangeAnalysis: `
    SELECT
      CASE
        WHEN amount < 200 THEN '~200円'
        WHEN amount < 500 THEN '200~500円'
        WHEN amount < 1000 THEN '500~1000円'
        WHEN amount < 2000 THEN '1000~2000円'
        ELSE '2000円以上'
      END as price_range,
      COUNT(*) as transaction_count,
      SUM(amount) as total_revenue
    FROM purchase_history
    GROUP BY price_range
    ORDER BY MIN(amount)
  `,

  // Store performance comparison
  storePerformance: `
    SELECT
      store,
      COUNT(DISTINCT member_id) as unique_customers,
      COUNT(*) as transactions,
      SUM(amount) as total_revenue,
      AVG(amount) as avg_transaction_value,
      SUM(qty) as total_items_sold
    FROM purchase_history
    GROUP BY store
    ORDER BY total_revenue DESC
  `,

  // Top products by department
  topProducts: `
    SELECT
      category,
      product,
      COUNT(*) as purchase_count,
      SUM(amount) as total_revenue,
      AVG(amount) as avg_price
    FROM purchase_history
    GROUP BY category, product
    ORDER BY total_revenue DESC
    LIMIT 20
  `,

  // Customer lifetime value distribution
  customerLTV: `
    SELECT
      CASE
        WHEN total_spent < 5000 THEN '~5千円'
        WHEN total_spent < 20000 THEN '5千~2万円'
        WHEN total_spent < 50000 THEN '2万~5万円'
        WHEN total_spent < 100000 THEN '5万~10万円'
        ELSE '10万円以上'
      END as ltv_range,
      COUNT(*) as customer_count,
      AVG(total_spent) as avg_ltv
    FROM (
      SELECT
        member_id,
        SUM(amount) as total_spent
      FROM purchase_history
      GROUP BY member_id
    )
    GROUP BY ltv_range
    ORDER BY MIN(total_spent)
  `,

  // Monthly category trend
  monthlyCategoryTrend: `
    SELECT
      strftime(purchase_date, '%Y-%m') as month,
      category,
      SUM(amount) as revenue,
      COUNT(*) as transactions
    FROM purchase_history
    GROUP BY strftime(purchase_date, '%Y-%m'), category
    ORDER BY month, revenue DESC
  `,

  // Timeframe summary
  timeframeSummary: `
    SELECT
      MIN(purchase_date) as start_date,
      MAX(purchase_date) as end_date,
      COUNT(DISTINCT purchase_date) as active_days
    FROM purchase_history
  `,
};

export type AnalysisQueryKey = keyof typeof ANALYSIS_QUERIES;
