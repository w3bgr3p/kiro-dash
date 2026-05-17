# Kiro Quota Dashboard

Система мониторинга квот для Kiro аккаунтов в OmniRoute.

## 📁 Файлы

### Скрипты анализа:
- **`analyze_kiro_quotas_simple.sh`** - Простой bash скрипт для анализа квот
- **`analyze_kiro_quotas.sh`** - Детальная версия с дополнительной статистикой
- **`analyze_kiro_quotas.js`** - Node.js версия (требует `npm install sqlite3`)

### Dashboard:
- **`kiro_quota_dashboard.html`** - Статический dashboard (работает с OmniRoute API)
- **`kiro_quota_dashboard_v2.html`** - Улучшенный dashboard с реальными данными
- **`kiro_dashboard_server.js`** - API сервер для dashboard (Node.js)

## 🚀 Быстрый старт

### Вариант 1: Bash скрипт (самый простой)

```bash
bash ~/analyze_kiro_quotas_simple.sh
```

**Вывод:**
```
🔍 Kiro Quota Analysis Report
================================================================================
Total Accounts: 19
Exhausted: 18
Active: 1

💰 ESTIMATED QUOTA LIMITS
Average Requests: 1,115
Average Tokens: 39,395,510

🔥 TOP 10 EXHAUSTED ACCOUNTS
...
```

### Вариант 2: Web Dashboard с API сервером

1. **Запустите API сервер:**
```bash
node ~/kiro_dashboard_server.js
```

Вывод:
```
🚀 Kiro Quota Dashboard API running on http://localhost:20129
📊 Available endpoints:
   - GET /api/summary
   - GET /api/accounts
   - GET /api/daily-usage
   - GET /api/reset-times
```

2. **Откройте dashboard в браузере:**
```bash
start ~/kiro_quota_dashboard_v2.html
# или
open ~/kiro_quota_dashboard_v2.html  # macOS
```

Dashboard автоматически обновляется каждые 60 секунд.

### Вариант 3: Статический dashboard (без API сервера)

Просто откройте `kiro_quota_dashboard.html` в браузере. Он будет использовать OmniRoute API напрямую (порт 20128).

## 📊 Что показывает dashboard

### Основная статистика:
- **Total Accounts** - Всего Kiro аккаунтов
- **Exhausted** - Исчерпанные аккаунты
- **Active** - Активные аккаунты
- **Avg Quota** - Средняя квота на аккаунт (~1,115 запросов)

### Детали по каждому аккаунту:
- Статус (Active/Exhausted)
- Количество запросов
- Использованные токены
- Success rate
- Приоритет
- **Время до сброса квоты** (для исчерпанных)

### Дневная статистика:
- Запросы по дням
- Токены
- Количество активных аккаунтов
- Success rate

## 🔍 Основные выводы из анализа

### Расчетная квота на аккаунт:
- **Средняя:** ~1,115 запросов
- **Медиана:** ~630 запросов
- **Средние токены:** ~39.4M токенов

### Текущая ситуация (2026-05-17):
- ❌ **18 из 19** аккаунтов исчерпаны (95%)
- ✅ **1 активный** аккаунт
- 📊 **Использовано:** ~244 запроса из ~1,115
- ⏰ **Оставшаяся емкость:** ~871 запрос

### Предполагаемое время сброса квот:

Квоты сбрасываются примерно через **24 часа** после исчерпания:

| Аккаунт | Первая ошибка 402 | Ожидаемый сброс |
|---------|-------------------|-----------------|
| 951edc85 | 2026-05-17 02:15 | 2026-05-18 02:15 |
| 499e7d51 | 2026-05-16 16:34 | 2026-05-17 16:34 |
| 05303ced | 2026-05-16 03:04 | 2026-05-17 03:04 |

## 🛠️ API Endpoints

Если запущен `kiro_dashboard_server.js`:

### GET /api/summary
Общая статистика:
```json
{
  "success": true,
  "data": {
    "total": 19,
    "exhausted": 18,
    "active": 1,
    "avg_quota": 1115
  }
}
```

### GET /api/accounts
Список всех аккаунтов с деталями:
```json
{
  "success": true,
  "data": [
    {
      "id": "326c4fec-c8eb-478c-8c3f-4cc53203ce64",
      "name": "a2",
      "priority": 2,
      "is_active": 1,
      "last_error": "You have reached the limit.",
      "total_requests": 630,
      "total_tokens": 4418406,
      "successful_requests": 427
    }
  ]
}
```

### GET /api/daily-usage
Дневная статистика за последние 7 дней:
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-05-17",
      "requests": 544,
      "tokens": 32285452,
      "accounts": 19,
      "success_rate": 78.0
    }
  ]
}
```

### GET /api/reset-times
Время сброса квот для исчерпанных аккаунтов:
```json
{
  "success": true,
  "data": [
    {
      "account": "951edc85",
      "id": "951edc85-fe3a-49b8-b063-85de7efab1f6",
      "last_success": "2026-05-17T03:22:54.406Z",
      "first_error": "2026-05-17T02:15:57.581Z"
    }
  ]
}
```

## 💡 Рекомендации

### Критическая ситуация:
⚠️ **18 из 19 аккаунтов исчерпаны!**

**Действия:**
1. ✅ Добавить больше Kiro аккаунтов
2. ✅ Включить rate limit protection в OmniRoute
3. ✅ Использовать OpenRouter как fallback провайдер
4. ✅ Мониторить активный аккаунт (осталось ~871 запрос)

### Автоматизация мониторинга:

Добавьте в cron для регулярной проверки:
```bash
# Проверка каждые 30 минут
*/30 * * * * bash ~/analyze_kiro_quotas_simple.sh > ~/kiro_quota_report.txt
```

Или запустите dashboard сервер как systemd service (Linux) или через PM2:
```bash
pm2 start ~/kiro_dashboard_server.js --name kiro-dashboard
pm2 save
pm2 startup
```

## 🔧 Требования

### Для bash скриптов:
- `bash`
- `sqlite3` CLI
- OmniRoute установлен в `~/.omniroute/`

### Для Node.js версий:
- Node.js v14+
- Для `analyze_kiro_quotas.js`: `npm install sqlite3`
- Для `kiro_dashboard_server.js`: только встроенные модули

### Для dashboard:
- Современный браузер (Chrome, Firefox, Safari, Edge)
- OmniRoute запущен (для прямого подключения)
- Или API сервер запущен (для версии v2)

## 📝 Примечания

1. **Квоты не хранятся в БД** - OmniRoute не получает информацию об оставшихся квотах от Kiro API
2. **Расчетные значения** - квота ~1,115 запросов вычислена как среднее по исчерпанным аккаунтам
3. **24-часовой цикл** - предполагается, что квоты сбрасываются через 24 часа после исчерпания
4. **Проверяйте вручную** - если аккаунт показывает "Should be reset", попробуйте сделать тестовый запрос

## 🐛 Troubleshooting

### Dashboard не загружается:
1. Проверьте, что OmniRoute запущен: `curl http://localhost:20128/api/providers`
2. Для v2 dashboard: убедитесь, что API сервер запущен на порту 20129
3. Проверьте CORS в браузере (откройте Developer Tools → Console)

### API сервер не запускается:
1. Проверьте, что порт 20129 свободен: `netstat -ano | grep 20129`
2. Убедитесь, что путь к БД правильный: `ls ~/.omniroute/storage.sqlite`
3. Проверьте, что `sqlite3` CLI установлен: `which sqlite3`

### Bash скрипт выдает ошибку:
1. Проверьте права на выполнение: `chmod +x ~/analyze_kiro_quotas_simple.sh`
2. Убедитесь, что БД существует: `ls -lh ~/.omniroute/storage.sqlite`
3. Проверьте версию sqlite3: `sqlite3 --version`

## 📄 Лицензия

MIT

## 👤 Автор

Created for OmniRoute quota monitoring
