// =============================================
// DuckDB-Wasm Integration
// =============================================

import * as duckdb from '@duckdb/duckdb-wasm';
import type { DataSchema, ColumnInfo } from '../types';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;

// Store current data schema for BYD mode
let currentDataSchema: DataSchema | null = null;

export function getCurrentDataSchema(): DataSchema | null {
  return currentDataSchema;
}

export function setCurrentDataSchema(schema: DataSchema | null): void {
  currentDataSchema = schema;
}

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

// ============ BYD Mode Functions ============

/**
 * Load CSV from string content (for BYD mode file upload)
 */
export async function loadCSVFromContent(
  tableName: string,
  csvContent: string
): Promise<number> {
  const connection = await getConnection();

  // Drop existing table if exists
  try {
    await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
  } catch {
    // Ignore if table doesn't exist
  }

  // Register the CSV content and create table
  await db!.registerFileText(`${tableName}.csv`, csvContent);

  await connection.query(`
    CREATE TABLE ${tableName} AS
    SELECT * FROM read_csv_auto('${tableName}.csv')
  `);

  // Get row count
  const countResult = await connection.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  const count = countResult.toArray()[0]?.toJSON() as { cnt: number };

  console.log(`[DuckDB] Loaded BYD table: ${tableName} with ${count.cnt} rows`);
  return count.cnt;
}

/**
 * Analyze uploaded data and detect schema
 */
export async function analyzeDataSchema(tableName: string): Promise<DataSchema> {
  const connection = await getConnection();

  // Get column info from DESCRIBE
  const describeResult = await connection.query(`DESCRIBE ${tableName}`);
  const columnDescriptions = describeResult.toArray().map((row) => {
    const json = row.toJSON() as Record<string, unknown>;
    return {
      name: String(json.column_name),
      dbType: String(json.column_type),
    };
  });

  // Get row count
  const countResult = await connection.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  const rowCount = (countResult.toArray()[0]?.toJSON() as { cnt: number }).cnt;

  // Analyze each column
  const columns: ColumnInfo[] = [];

  for (const col of columnDescriptions) {
    // Get sample values and statistics
    const sampleQuery = `
      SELECT
        "${col.name}" as val,
        COUNT(*) as cnt
      FROM ${tableName}
      WHERE "${col.name}" IS NOT NULL
      GROUP BY "${col.name}"
      ORDER BY cnt DESC
      LIMIT 5
    `;
    const sampleResult = await connection.query(sampleQuery);
    const samples = sampleResult.toArray().map((r) => String((r.toJSON() as { val: unknown }).val));

    // Count nulls
    const nullQuery = `SELECT COUNT(*) as cnt FROM ${tableName} WHERE "${col.name}" IS NULL`;
    const nullResult = await connection.query(nullQuery);
    const nullCount = (nullResult.toArray()[0]?.toJSON() as { cnt: number }).cnt;

    // Count unique values
    const uniqueQuery = `SELECT COUNT(DISTINCT "${col.name}") as cnt FROM ${tableName}`;
    const uniqueResult = await connection.query(uniqueQuery);
    const uniqueCount = (uniqueResult.toArray()[0]?.toJSON() as { cnt: number }).cnt;

    // Determine column type
    let colType: ColumnInfo['type'] = 'unknown';
    if (col.dbType.includes('VARCHAR') || col.dbType.includes('TEXT')) {
      colType = 'string';
    } else if (col.dbType.includes('INT') || col.dbType.includes('DOUBLE') || col.dbType.includes('DECIMAL') || col.dbType.includes('FLOAT')) {
      colType = 'number';
    } else if (col.dbType.includes('DATE') || col.dbType.includes('TIMESTAMP')) {
      colType = 'date';
    }

    // Infer column role based on name patterns
    const inferredRole = inferColumnRole(col.name, colType, samples, uniqueCount, rowCount);

    columns.push({
      name: col.name,
      type: colType,
      sampleValues: samples,
      nullCount,
      uniqueCount,
      inferredRole,
    });
  }

  // Build column mappings
  const columnMappings = buildColumnMappings(columns);

  // Infer data type (supermarket, drugstore, etc.)
  const dataType = inferDataType(columns);

  // Generate summary
  const summary = generateDataSummary(tableName, rowCount, columns, dataType, columnMappings);

  const schema: DataSchema = {
    tableName,
    rowCount,
    columns,
    summary,
    dataType,
    columnMappings,
  };

  // Store schema for later use
  setCurrentDataSchema(schema);

  return schema;
}

/**
 * Infer the role of a column based on its name and characteristics
 */
function inferColumnRole(
  name: string,
  type: ColumnInfo['type'],
  _samples: string[],
  uniqueCount: number,
  _rowCount: number
): ColumnInfo['inferredRole'] {
  const lowerName = name.toLowerCase();

  // Date patterns
  if (type === 'date' || lowerName.includes('date') || lowerName.includes('日付') || lowerName.includes('購買') || lowerName.includes('_dt')) {
    return 'date';
  }

  // Member/Customer ID patterns
  if (lowerName.includes('member') || lowerName.includes('customer') || lowerName.includes('会員') || lowerName.includes('顧客') || lowerName.includes('user')) {
    return 'member_id';
  }

  // Transaction ID patterns
  if (lowerName.includes('transaction') || lowerName.includes('取引') || lowerName.includes('receipt') || lowerName.includes('レシート') || lowerName.includes('order')) {
    return 'transaction_id';
  }

  // Store patterns
  if (lowerName.includes('store') || lowerName.includes('店舗') || lowerName.includes('店') || lowerName.includes('shop') || lowerName.includes('branch')) {
    return 'store';
  }

  // Category/Department patterns
  if (lowerName.includes('category') || lowerName.includes('部門') || lowerName.includes('カテゴリ') || lowerName.includes('department') || lowerName.includes('dept')) {
    return 'category';
  }

  // Product patterns
  if (lowerName.includes('product') || lowerName.includes('商品') || lowerName.includes('item') || lowerName.includes('品名') || lowerName.includes('sku')) {
    return 'product';
  }

  // Quantity patterns
  if (lowerName.includes('qty') || lowerName.includes('quantity') || lowerName.includes('数量') || lowerName.includes('個数') || lowerName === 'num') {
    return 'quantity';
  }

  // Amount patterns
  if (type === 'number' && (lowerName.includes('amount') || lowerName.includes('price') || lowerName.includes('金額') || lowerName.includes('売上') || lowerName.includes('単価') || lowerName.includes('total'))) {
    return 'amount';
  }

  // If numeric and not matched above, could be amount if uniqueCount is high
  if (type === 'number' && uniqueCount > 10) {
    return 'amount';
  }

  return 'other';
}

/**
 * Build column mappings from detected columns
 */
function buildColumnMappings(columns: ColumnInfo[]): DataSchema['columnMappings'] {
  const mappings: DataSchema['columnMappings'] = {};

  for (const col of columns) {
    switch (col.inferredRole) {
      case 'date':
        if (!mappings.dateColumn) mappings.dateColumn = col.name;
        break;
      case 'member_id':
        if (!mappings.memberIdColumn) mappings.memberIdColumn = col.name;
        break;
      case 'store':
        if (!mappings.storeColumn) mappings.storeColumn = col.name;
        break;
      case 'category':
        if (!mappings.categoryColumn) mappings.categoryColumn = col.name;
        break;
      case 'product':
        if (!mappings.productColumn) mappings.productColumn = col.name;
        break;
      case 'quantity':
        if (!mappings.quantityColumn) mappings.quantityColumn = col.name;
        break;
      case 'amount':
        if (!mappings.amountColumn) mappings.amountColumn = col.name;
        break;
      case 'transaction_id':
        if (!mappings.transactionIdColumn) mappings.transactionIdColumn = col.name;
        break;
    }
  }

  return mappings;
}

/**
 * Infer data type (supermarket, drugstore, etc.)
 */
function inferDataType(columns: ColumnInfo[]): DataSchema['dataType'] {
  // Check for category values that might indicate type
  const categoryCol = columns.find((c) => c.inferredRole === 'category');
  if (categoryCol) {
    const samples = categoryCol.sampleValues.join(' ').toLowerCase();

    // Supermarket indicators
    if (samples.includes('青果') || samples.includes('鮮魚') || samples.includes('精肉') || samples.includes('野菜') || samples.includes('果物')) {
      return 'supermarket';
    }

    // Drugstore indicators
    if (samples.includes('医薬品') || samples.includes('化粧品') || samples.includes('日用品') || samples.includes('ヘルスケア')) {
      return 'drugstore';
    }
  }

  // Check product names
  const productCol = columns.find((c) => c.inferredRole === 'product');
  if (productCol) {
    const samples = productCol.sampleValues.join(' ').toLowerCase();

    if (samples.includes('肉') || samples.includes('魚') || samples.includes('野菜') || samples.includes('米') || samples.includes('パン')) {
      return 'supermarket';
    }

    if (samples.includes('薬') || samples.includes('シャンプー') || samples.includes('化粧') || samples.includes('サプリ')) {
      return 'drugstore';
    }
  }

  return 'retail';
}

/**
 * Generate natural language summary of the data
 */
function generateDataSummary(
  tableName: string,
  rowCount: number,
  columns: ColumnInfo[],
  dataType: DataSchema['dataType'],
  mappings: DataSchema['columnMappings']
): string {
  const dataTypeJa = {
    supermarket: '生鮮食品スーパーマーケット',
    drugstore: 'ドラッグストア',
    retail: '小売店',
    unknown: '不明',
  };

  const detectedColumns = [];
  if (mappings.dateColumn) detectedColumns.push(`日付(${mappings.dateColumn})`);
  if (mappings.memberIdColumn) detectedColumns.push(`会員ID(${mappings.memberIdColumn})`);
  if (mappings.storeColumn) detectedColumns.push(`店舗(${mappings.storeColumn})`);
  if (mappings.categoryColumn) detectedColumns.push(`部門(${mappings.categoryColumn})`);
  if (mappings.productColumn) detectedColumns.push(`商品(${mappings.productColumn})`);
  if (mappings.amountColumn) detectedColumns.push(`金額(${mappings.amountColumn})`);
  if (mappings.transactionIdColumn) detectedColumns.push(`取引ID(${mappings.transactionIdColumn})`);

  return `【データ概要】
テーブル名: ${tableName}
行数: ${rowCount.toLocaleString()}行
列数: ${columns.length}列
推定業態: ${dataTypeJa[dataType]}

【検出された列】
${detectedColumns.join('、') || '自動検出できませんでした'}

【全列名】
${columns.map((c) => c.name).join('、')}`;
}

/**
 * Generate dynamic queries based on detected schema
 */
export function generateDynamicQueries(schema: DataSchema): Record<string, string> {
  const m = schema.columnMappings;
  const table = schema.tableName;

  // If missing critical columns, return empty
  if (!m.amountColumn) {
    console.warn('[DuckDB] Cannot generate queries: missing amount column');
    return {};
  }

  const queries: Record<string, string> = {};

  // Total sales (always available if we have amount)
  queries.totalSales = `
    SELECT
      COUNT(*) as transaction_count,
      SUM("${m.amountColumn}") as total_revenue,
      AVG("${m.amountColumn}") as avg_transaction_value
      ${m.memberIdColumn ? `, COUNT(DISTINCT "${m.memberIdColumn}") as unique_customers` : ''}
      ${m.transactionIdColumn ? `, COUNT(DISTINCT "${m.transactionIdColumn}") as total_transactions` : ''}
    FROM ${table}
  `;

  // Monthly trend (if we have date)
  if (m.dateColumn) {
    queries.monthlyTrend = `
      SELECT
        strftime("${m.dateColumn}", '%Y-%m') as month,
        COUNT(*) as transactions,
        SUM("${m.amountColumn}") as revenue
        ${m.memberIdColumn ? `, COUNT(DISTINCT "${m.memberIdColumn}") as unique_customers` : ''}
      FROM ${table}
      GROUP BY strftime("${m.dateColumn}", '%Y-%m')
      ORDER BY month
    `;

    queries.dayOfWeekPattern = `
      SELECT
        dayofweek("${m.dateColumn}") as dow,
        CASE dayofweek("${m.dateColumn}")
          WHEN 0 THEN '日曜日'
          WHEN 1 THEN '月曜日'
          WHEN 2 THEN '火曜日'
          WHEN 3 THEN '水曜日'
          WHEN 4 THEN '木曜日'
          WHEN 5 THEN '金曜日'
          WHEN 6 THEN '土曜日'
        END as day_name,
        COUNT(*) as transactions,
        SUM("${m.amountColumn}") as revenue
      FROM ${table}
      GROUP BY dayofweek("${m.dateColumn}")
      ORDER BY dow
    `;

    queries.timeframeSummary = `
      SELECT
        MIN("${m.dateColumn}") as start_date,
        MAX("${m.dateColumn}") as end_date,
        COUNT(DISTINCT "${m.dateColumn}") as active_days
      FROM ${table}
    `;
  }

  // Store performance (if we have store)
  if (m.storeColumn) {
    queries.storePerformance = `
      SELECT
        "${m.storeColumn}" as store,
        COUNT(*) as transactions,
        SUM("${m.amountColumn}") as total_revenue,
        AVG("${m.amountColumn}") as avg_transaction_value
        ${m.memberIdColumn ? `, COUNT(DISTINCT "${m.memberIdColumn}") as unique_customers` : ''}
      FROM ${table}
      GROUP BY "${m.storeColumn}"
      ORDER BY total_revenue DESC
    `;
  }

  // Category/Department analysis (if we have category)
  if (m.categoryColumn) {
    queries.salesByCategory = `
      SELECT
        "${m.categoryColumn}" as category,
        COUNT(*) as transactions,
        SUM("${m.amountColumn}") as revenue,
        AVG("${m.amountColumn}") as avg_amount
      FROM ${table}
      GROUP BY "${m.categoryColumn}"
      ORDER BY revenue DESC
    `;
  }

  // Customer segments (if we have member ID)
  if (m.memberIdColumn) {
    queries.customerSegments = `
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
          "${m.memberIdColumn}",
          COUNT(*) as purchase_count,
          SUM("${m.amountColumn}") as total_spent
        FROM ${table}
        GROUP BY "${m.memberIdColumn}"
      )
      GROUP BY segment
      ORDER BY avg_spent DESC
    `;

    queries.customerLTV = `
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
          "${m.memberIdColumn}",
          SUM("${m.amountColumn}") as total_spent
        FROM ${table}
        GROUP BY "${m.memberIdColumn}"
      )
      GROUP BY ltv_range
      ORDER BY MIN(total_spent)
    `;
  }

  // Basket analysis (if we have transaction ID)
  if (m.transactionIdColumn) {
    queries.basketSize = `
      SELECT
        items_in_basket,
        COUNT(*) as transaction_count,
        AVG(basket_value) as avg_basket_value,
        SUM(basket_value) as total_value
      FROM (
        SELECT
          "${m.transactionIdColumn}",
          COUNT(*) as items_in_basket,
          SUM("${m.amountColumn}") as basket_value
        FROM ${table}
        GROUP BY "${m.transactionIdColumn}"
      )
      GROUP BY items_in_basket
      ORDER BY items_in_basket
    `;

    // Category co-purchase (if we have both transaction ID and category)
    if (m.categoryColumn) {
      queries.categoryCoPurchase = `
        SELECT
          a."${m.categoryColumn}" as category_a,
          b."${m.categoryColumn}" as category_b,
          COUNT(DISTINCT a."${m.transactionIdColumn}") as co_occurrence_count
        FROM ${table} a
        JOIN ${table} b
          ON a."${m.transactionIdColumn}" = b."${m.transactionIdColumn}"
          AND a."${m.categoryColumn}" < b."${m.categoryColumn}"
        GROUP BY a."${m.categoryColumn}", b."${m.categoryColumn}"
        HAVING COUNT(DISTINCT a."${m.transactionIdColumn}") > 10
        ORDER BY co_occurrence_count DESC
        LIMIT 15
      `;
    }
  }

  // Price range analysis
  queries.priceRangeAnalysis = `
    SELECT
      CASE
        WHEN "${m.amountColumn}" < 200 THEN '~200円'
        WHEN "${m.amountColumn}" < 500 THEN '200~500円'
        WHEN "${m.amountColumn}" < 1000 THEN '500~1000円'
        WHEN "${m.amountColumn}" < 2000 THEN '1000~2000円'
        ELSE '2000円以上'
      END as price_range,
      COUNT(*) as transaction_count,
      SUM("${m.amountColumn}") as total_revenue
    FROM ${table}
    GROUP BY price_range
    ORDER BY MIN("${m.amountColumn}")
  `;

  // Top products (if we have product)
  if (m.productColumn) {
    queries.topProducts = `
      SELECT
        ${m.categoryColumn ? `"${m.categoryColumn}" as category,` : ''}
        "${m.productColumn}" as product,
        COUNT(*) as purchase_count,
        SUM("${m.amountColumn}") as total_revenue,
        AVG("${m.amountColumn}") as avg_price
      FROM ${table}
      GROUP BY ${m.categoryColumn ? `"${m.categoryColumn}", ` : ''}"${m.productColumn}"
      ORDER BY total_revenue DESC
      LIMIT 20
    `;
  }

  return queries;
}
