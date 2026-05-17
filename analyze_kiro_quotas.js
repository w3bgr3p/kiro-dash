#!/usr/bin/env node

/**
 * Kiro Quota Analysis Script
 * Анализирует использование квот Kiro аккаунтов на основе логов и статистики
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.omniroute', 'storage.sqlite');

class KiroQuotaAnalyzer {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  }

  /**
   * Получить все Kiro подключения с их статусами
   */
  async getKiroConnections() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          id,
          name,
          is_active,
          test_status,
          error_code,
          last_error,
          last_error_at,
          last_error_type,
          last_tested,
          created_at
        FROM provider_connections
        WHERE provider = 'kiro'
        ORDER BY priority
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Получить статистику использования по connection_id
   */
  async getUsageStats(connectionId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          COUNT(*) as total_requests,
          SUM(tokens_input) as total_input_tokens,
          SUM(tokens_output) as total_output_tokens,
          SUM(tokens_cache_read) as total_cache_read,
          SUM(tokens_cache_creation) as total_cache_creation,
          SUM(success) as successful_requests,
          MIN(timestamp) as first_request,
          MAX(timestamp) as last_request,
          MAX(CASE WHEN success = 1 THEN timestamp END) as last_successful_request
        FROM usage_history
        WHERE connection_id = ?
      `;

      this.db.get(query, [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Получить последние успешные запросы перед лимитированием
   */
  async getLastSuccessfulRequests(connectionId, limit = 10) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          timestamp,
          tokens_input,
          tokens_output,
          model,
          success
        FROM usage_history
        WHERE connection_id = ? AND success = 1
        ORDER BY timestamp DESC
        LIMIT ?
      `;

      this.db.all(query, [connectionId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Получить дневную статистику по всем Kiro аккаунтам
   */
  async getDailyStats() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          pc.id as connection_id,
          pc.name,
          DATE(uh.timestamp) as date,
          COUNT(*) as requests,
          SUM(uh.tokens_input) as input_tokens,
          SUM(uh.tokens_output) as output_tokens,
          SUM(uh.success) as successful_requests
        FROM usage_history uh
        JOIN provider_connections pc ON uh.connection_id = pc.id
        WHERE pc.provider = 'kiro'
        GROUP BY pc.id, pc.name, DATE(uh.timestamp)
        ORDER BY date DESC, pc.name
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Получить статистику по call_logs (успешные и неуспешные запросы)
   */
  async getCallLogsStats(connectionId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN status = 200 THEN 1 ELSE 0 END) as successful_calls,
          SUM(CASE WHEN status = 402 THEN 1 ELSE 0 END) as quota_exceeded_calls,
          MIN(timestamp) as first_call,
          MAX(timestamp) as last_call,
          MAX(CASE WHEN status = 200 THEN timestamp END) as last_successful_call,
          MIN(CASE WHEN status = 402 THEN timestamp END) as first_quota_exceeded
        FROM call_logs
        WHERE connection_id = ?
      `;

      this.db.get(query, [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Вычислить среднюю квоту на аккаунт
   */
  async calculateAverageQuota() {
    const connections = await this.getKiroConnections();
    const exhaustedAccounts = [];
    const activeAccounts = [];

    for (const conn of connections) {
      const usageStats = await this.getUsageStats(conn.id);
      const callLogsStats = await this.getCallLogsStats(conn.id);

      const accountData = {
        ...conn,
        usage: usageStats,
        callLogs: callLogsStats
      };

      if (conn.last_error && conn.last_error.includes('limit')) {
        exhaustedAccounts.push(accountData);
      } else {
        activeAccounts.push(accountData);
      }
    }

    return { exhaustedAccounts, activeAccounts };
  }

  /**
   * Форматировать дату
   */
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Вычислить время до возможного сброса квоты
   */
  estimateQuotaReset(lastSuccessful, firstExhausted) {
    if (!lastSuccessful || !firstExhausted) return null;

    const lastSuccess = new Date(lastSuccessful);
    const firstFail = new Date(firstExhausted);
    const now = new Date();

    // Предполагаем сброс через 24 часа после исчерпания
    const estimatedReset = new Date(firstFail.getTime() + 24 * 60 * 60 * 1000);
    const hoursUntilReset = Math.max(0, (estimatedReset - now) / (1000 * 60 * 60));

    return {
      lastSuccessful: this.formatDate(lastSuccess),
      firstExhausted: this.formatDate(firstFail),
      estimatedReset: this.formatDate(estimatedReset),
      hoursUntilReset: hoursUntilReset.toFixed(1)
    };
  }

  /**
   * Главный метод анализа
   */
  async analyze() {
    console.log('🔍 Kiro Quota Analysis');
    console.log('='.repeat(80));
    console.log(`Current time: ${new Date().toISOString()}\n`);

    const { exhaustedAccounts, activeAccounts } = await this.calculateAverageQuota();

    // Статистика по исчерпанным аккаунтам
    console.log('❌ EXHAUSTED ACCOUNTS:');
    console.log('-'.repeat(80));

    let totalRequestsExhausted = 0;
    let totalTokensExhausted = 0;

    for (const acc of exhaustedAccounts) {
      const requests = acc.usage.total_requests || 0;
      const tokens = (acc.usage.total_input_tokens || 0) + (acc.usage.total_output_tokens || 0);

      totalRequestsExhausted += requests;
      totalTokensExhausted += tokens;

      const resetInfo = this.estimateQuotaReset(
        acc.callLogs.last_successful_call,
        acc.callLogs.first_quota_exceeded
      );

      console.log(`\n📛 ${acc.name || acc.id.substring(0, 8)}`);
      console.log(`   ID: ${acc.id}`);
      console.log(`   Total Requests: ${requests.toLocaleString()}`);
      console.log(`   Total Tokens: ${tokens.toLocaleString()}`);
      console.log(`   Successful: ${acc.usage.successful_requests || 0}`);
      console.log(`   Last Successful: ${this.formatDate(acc.callLogs.last_successful_call)}`);
      console.log(`   First 402 Error: ${this.formatDate(acc.callLogs.first_quota_exceeded)}`);

      if (resetInfo) {
        console.log(`   Estimated Reset: ${resetInfo.estimatedReset} (in ~${resetInfo.hoursUntilReset}h)`);
      }
    }

    // Статистика по активным аккаунтам
    console.log('\n\n✅ ACTIVE ACCOUNTS:');
    console.log('-'.repeat(80));

    let totalRequestsActive = 0;
    let totalTokensActive = 0;

    for (const acc of activeAccounts) {
      const requests = acc.usage.total_requests || 0;
      const tokens = (acc.usage.total_input_tokens || 0) + (acc.usage.total_output_tokens || 0);

      totalRequestsActive += requests;
      totalTokensActive += tokens;

      console.log(`\n✅ ${acc.name || acc.id.substring(0, 8)}`);
      console.log(`   ID: ${acc.id}`);
      console.log(`   Total Requests: ${requests.toLocaleString()}`);
      console.log(`   Total Tokens: ${tokens.toLocaleString()}`);
      console.log(`   Successful: ${acc.usage.successful_requests || 0}`);
      console.log(`   Last Request: ${this.formatDate(acc.usage.last_request)}`);
    }

    // Общая статистика
    console.log('\n\n📊 SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total Accounts: ${exhaustedAccounts.length + activeAccounts.length}`);
    console.log(`  Exhausted: ${exhaustedAccounts.length}`);
    console.log(`  Active: ${activeAccounts.length}`);

    if (exhaustedAccounts.length > 0) {
      const avgRequestsExhausted = totalRequestsExhausted / exhaustedAccounts.length;
      const avgTokensExhausted = totalTokensExhausted / exhaustedAccounts.length;

      console.log(`\nAverage per EXHAUSTED account:`);
      console.log(`  Requests: ${avgRequestsExhausted.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
      console.log(`  Tokens: ${avgTokensExhausted.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
    }

    if (activeAccounts.length > 0) {
      const avgRequestsActive = totalRequestsActive / activeAccounts.length;
      const avgTokensActive = totalTokensActive / activeAccounts.length;

      console.log(`\nAverage per ACTIVE account:`);
      console.log(`  Requests: ${avgRequestsActive.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
      console.log(`  Tokens: ${avgTokensActive.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
    }

    // Дневная статистика
    console.log('\n\n📅 DAILY USAGE (Last 7 days):');
    console.log('-'.repeat(80));

    const dailyStats = await this.getDailyStats();
    const last7Days = dailyStats.slice(0, 50);

    const dailyByDate = {};
    for (const stat of last7Days) {
      if (!dailyByDate[stat.date]) {
        dailyByDate[stat.date] = {
          date: stat.date,
          requests: 0,
          tokens: 0,
          accounts: []
        };
      }
      dailyByDate[stat.date].requests += stat.requests;
      dailyByDate[stat.date].tokens += stat.input_tokens + stat.output_tokens;
      dailyByDate[stat.date].accounts.push(stat.name || stat.connection_id.substring(0, 8));
    }

    Object.values(dailyByDate).forEach(day => {
      console.log(`\n${day.date}:`);
      console.log(`  Total Requests: ${day.requests.toLocaleString()}`);
      console.log(`  Total Tokens: ${day.tokens.toLocaleString()}`);
      console.log(`  Accounts: ${day.accounts.join(', ')}`);
    });

    console.log('\n' + '='.repeat(80));
  }

  close() {
    this.db.close();
  }
}

// Запуск анализа
(async () => {
  const analyzer = new KiroQuotaAnalyzer(DB_PATH);

  try {
    await analyzer.analyze();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    analyzer.close();
  }
})();
