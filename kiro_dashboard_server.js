#!/usr/bin/env node

/**
 * Kiro Quota Dashboard API Server
 * Provides REST API for the dashboard with real-time data from SQLite
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 20129;
const DB_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.omniroute', 'storage.sqlite');

// Execute SQLite query
function querySqlite(query) {
  return new Promise((resolve, reject) => {
    const sqlite = spawn('sqlite3', [DB_PATH, query]);
    let output = '';
    let error = '';

    sqlite.stdout.on('data', (data) => {
      output += data.toString();
    });

    sqlite.stderr.on('data', (data) => {
      error += data.toString();
    });

    sqlite.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error || 'SQLite query failed'));
      } else {
        resolve(output.trim());
      }
    });
  });
}

// Parse SQLite output to JSON
function parseSqliteOutput(output, columns) {
  if (!output) return [];

  const lines = output.split('\n');
  return lines.map(line => {
    const values = line.split('|');
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = values[i] ? values[i].trim() : null;
    });
    return obj;
  });
}

// API Handlers
const handlers = {
  '/api/summary': async () => {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM provider_connections WHERE provider = 'kiro') as total,
        (SELECT COUNT(*) FROM provider_connections WHERE provider = 'kiro' AND last_error LIKE '%limit%') as exhausted,
        (SELECT COUNT(*) FROM provider_connections WHERE provider = 'kiro' AND (last_error IS NULL OR last_error NOT LIKE '%limit%')) as active,
        (SELECT CAST(AVG(req_count) AS INTEGER) FROM (
          SELECT COUNT(uh.id) as req_count
          FROM provider_connections pc
          LEFT JOIN usage_history uh ON pc.id = uh.connection_id
          WHERE pc.provider = 'kiro' AND pc.last_error LIKE '%limit%'
          GROUP BY pc.id
        )) as avg_quota;
    `;

    const output = await querySqlite(query);
    const [data] = parseSqliteOutput(output, ['total', 'exhausted', 'active', 'avg_quota']);
    return data;
  },

  '/api/accounts': async () => {
    const query = `
      SELECT
        pc.id,
        pc.name,
        pc.priority,
        pc.is_active,
        pc.last_error,
        pc.last_error_at,
        pc.test_status,
        COUNT(uh.id) as total_requests,
        SUM(uh.tokens_input + uh.tokens_output) as total_tokens,
        SUM(uh.success) as successful_requests
      FROM provider_connections pc
      LEFT JOIN usage_history uh ON pc.id = uh.connection_id
      WHERE pc.provider = 'kiro'
      GROUP BY pc.id
      ORDER BY pc.priority;
    `;

    const output = await querySqlite(query);
    return parseSqliteOutput(output, [
      'id', 'name', 'priority', 'is_active', 'last_error', 'last_error_at',
      'test_status', 'total_requests', 'total_tokens', 'successful_requests'
    ]);
  },

  '/api/daily-usage': async () => {
    const query = `
      SELECT
        DATE(uh.timestamp) as date,
        COUNT(*) as requests,
        SUM(uh.tokens_input + uh.tokens_output) as tokens,
        COUNT(DISTINCT uh.connection_id) as accounts,
        ROUND(100.0 * SUM(uh.success) / COUNT(*), 1) as success_rate
      FROM usage_history uh
      JOIN provider_connections pc ON uh.connection_id = pc.id
      WHERE pc.provider = 'kiro'
      GROUP BY DATE(uh.timestamp)
      ORDER BY date DESC
      LIMIT 7;
    `;

    const output = await querySqlite(query);
    return parseSqliteOutput(output, ['date', 'requests', 'tokens', 'accounts', 'success_rate']);
  },

  '/api/reset-times': async () => {
    const query = `
      SELECT
        COALESCE(pc.name, SUBSTR(pc.id, 1, 8)) as account,
        pc.id,
        MAX(CASE WHEN cl.status = 200 THEN cl.timestamp END) as last_success,
        MIN(CASE WHEN cl.status = 402 THEN cl.timestamp END) as first_error
      FROM provider_connections pc
      LEFT JOIN call_logs cl ON pc.id = cl.connection_id
      WHERE pc.provider = 'kiro' AND pc.last_error LIKE '%limit%'
      GROUP BY pc.id, pc.name
      HAVING MIN(CASE WHEN cl.status = 402 THEN cl.timestamp END) IS NOT NULL
      ORDER BY first_error DESC;
    `;

    const output = await querySqlite(query);
    return parseSqliteOutput(output, ['account', 'id', 'last_success', 'first_error']);
  }
};

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = handlers[url.pathname];

  if (handler) {
    try {
      const data = await handler();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data }));
    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Kiro Quota Dashboard API running on http://localhost:${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`   - GET /api/summary`);
  console.log(`   - GET /api/accounts`);
  console.log(`   - GET /api/daily-usage`);
  console.log(`   - GET /api/reset-times`);
  console.log(``);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🌐 Open dashboard: file://${path.join(__dirname, 'kiro_quota_dashboard.html')}`);
});
