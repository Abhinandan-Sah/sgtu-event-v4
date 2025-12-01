# Production Utilities

Production-ready utilities for ongoing operations and performance optimization.

## 📁 Utilities

### Core Utilities

#### `cache.js`
**Purpose:** Redis cache management and helper functions  
**Category:** Core Infrastructure  
**Usage:** Imported by services and controllers

#### `excelParser.js`
**Purpose:** Parse Excel files for bulk student/stall imports  
**Category:** Data Processing  
**Usage:** Used by admin controllers for bulk operations

#### `logger.js`
**Purpose:** Winston-based structured logging  
**Category:** Observability  
**Usage:** Application-wide logging

---

### QR Production Utilities

#### `warm-qr-cache.js` ⭐
**Purpose:** Pre-generate and cache QR images in Redis for optimal performance  
**Category:** Performance Optimization  
**Frequency:** Run regularly (daily recommended)

```bash
npm run qr:warm-cache
# or
node src/utils/warm-qr-cache.js
```

**When to run:**
- **Daily via cron** (recommended: 6 AM before events)
- After database restore or token regeneration
- Before high-traffic periods
- As part of deployment pipeline

**Production Setup:**

**Option 1: Cron Job**
```bash
# Add to crontab
0 6 * * * cd /path/to/server && npm run qr:warm-cache >> /var/log/qr-cache.log 2>&1
```

**Option 2: PM2 Cron**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'qr-cache-warmer',
    script: 'src/utils/warm-qr-cache.js',
    cron_restart: '0 6 * * *',
    autorestart: false
  }]
}
```

**Option 3: GitHub Actions** (for serverless)
```yaml
# .github/workflows/warm-cache.yml
name: Warm QR Cache
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  warm-cache:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Warm Cache
        run: npm run qr:warm-cache
        env:
          NEON_DATABASE_URL: ${{ secrets.NEON_DATABASE_URL }}
          REDIS_URL: ${{ secrets.REDIS_URL }}
```

**Performance:**
- Processes ~100 QRs/second in batches
- Reduces first-scan latency from 200ms to <10ms
- Cache TTL: 24 hours (auto-renews on access)

**Output:**
```
✅ Students: 50/50 cached (0 failed)
✅ Stalls: 6/6 cached (0 failed)
📊 Student Speed: 100 QRs/second
⏱️  Total Duration: 3.45s
```

---

## 🔧 Usage Patterns

### In Production

| Utility | Run Frequency | Method | Purpose |
|---------|--------------|--------|---------|
| `warm-qr-cache.js` | Daily (6 AM) | Cron/PM2 | Keep cache fresh |
| `cache.js` | Always running | Import in code | Cache operations |
| `excelParser.js` | On-demand | API endpoint | Bulk imports |
| `logger.js` | Always running | Import in code | Application logs |

---

## 📊 Monitoring

### Cache Warming Metrics
```bash
# Check last run
tail -f /var/log/qr-cache.log

# Monitor Redis cache size
redis-cli info memory

# Check cache hit rate
redis-cli info stats | grep keyspace
```

### Alerts Setup
- Alert if cache warming fails
- Alert if cache hit rate < 80%
- Alert if warming duration > 60s

---

## 🔐 Environment Variables

```env
# Required for all utilities
NEON_DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=your-secret-key

# Optional logging
LOG_LEVEL=info
NODE_ENV=production
```

---

## 📝 Best Practices

1. **Cache Warming**: Run daily before peak hours
2. **Monitoring**: Set up alerts for failures
3. **Logging**: Rotate logs to prevent disk full
4. **Testing**: Validate in staging before production
5. **Rollback**: Keep previous cache if warming fails

---

## 🆚 Utils vs Scripts

**Utils (`src/utils/`):**
- Run regularly in production
- Part of ongoing operations
- Examples: cache warming, logging, parsing

**Scripts (`src/scripts/`):**
- One-time or infrequent operations
- Major migrations or updates
- Examples: token regeneration, schema changes
