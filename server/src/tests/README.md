# Test Suite

Production-grade testing infrastructure for QR code system.

## 📁 Structure

```
tests/
├── unit/              # Unit tests (isolated component testing)
├── integration/       # Integration tests (full system testing)
├── helpers/           # Test utilities and validators
└── README.md
```

---

## 🧪 Unit Tests (`unit/`)

### `qr-service.test.js`
**Purpose:** Test QR service methods in isolation  
**Coverage:** Token generation, verification, caching logic

```bash
npm run test:unit
# or
node src/tests/unit/qr-service.test.js
```

**Tests:**
- ✅ Student token generation
- ✅ Stall token generation
- ✅ Token verification (all formats)
- ✅ QR image generation
- ✅ Cache hit/miss behavior

---

## 🔗 Integration Tests (`integration/`)

### `qr-visual-test.js`
**Purpose:** Visual QR code testing with live server  
**Use Case:** Manual phone scanning, UI verification

```bash
npm run test:visual
# or
node src/tests/integration/qr-visual-test.js
```

**Features:**
- 🌐 Express server on `http://localhost:3001`
- 📱 Displays real QR codes from database
- 🔄 Refresh button for cache testing
- 📋 Copy token functionality
- 🖼️ Shows student (3) and stall (2) QR codes

**When to use:**
- Manual QR scanning with phone
- Visual density comparison
- Pre-production validation

---

## 🛠️ Test Helpers (`helpers/`)

### `token-comparison.js`
**Purpose:** Compare token formats and sizes  
**Output:** Production statistics and optimization metrics

```bash
npm run test:compare
# or
node src/tests/helpers/token-comparison.js
```

**Shows:**
- Token length comparison
- Payload structure
- Database storage confirmation
- Optimization statistics

---

### `token-uniqueness.js`
**Purpose:** Verify token uniqueness across database  
**Output:** Checks for duplicate tokens and nonce collisions

```bash
npm run test:uniqueness
# or
node src/tests/helpers/token-uniqueness.js
```

**Validates:**
- ✅ All tokens have unique starting characters
- ✅ Nonces are random and distinct
- ✅ No duplicate tokens in database

---

### `qr-scan-validator.js`
**Purpose:** Validate QR token content and scanning behavior  
**Output:** Expected scan results and troubleshooting

```bash
npm run test:scan
# or
node src/tests/helpers/qr-scan-validator.js
```

**Provides:**
- Expected token content
- Verification results
- Scanner app recommendations
- Troubleshooting for numeric mode issues

---

## 🚀 Running Tests

### Quick Test Suite
```bash
npm run test:all     # Run all tests
npm run test:unit    # Unit tests only
npm run test:visual  # Visual integration test
```

### Individual Tests
```bash
npm run test:compare     # Token comparison
npm run test:uniqueness  # Uniqueness validation
npm run test:scan        # Scan validation
```

---

## 📊 Test Coverage

| Component | Unit Tests | Integration Tests | Status |
|-----------|------------|-------------------|--------|
| Token Generation | ✅ | ✅ | Complete |
| Token Verification | ✅ | ✅ | Complete |
| QR Image Generation | ✅ | ✅ | Complete |
| Redis Caching | ✅ | ✅ | Complete |
| Database Integration | ⚠️ | ✅ | Partial |

---

## 🔐 Environment Variables

```env
NEON_DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=your-secret-key
```

---

## 📝 Adding New Tests

### Unit Test Template
```javascript
// src/tests/unit/my-test.test.js
import QRCodeService from '../../services/qrCode.js';

describe('My Test Suite', () => {
  it('should test something', () => {
    // Test implementation
  });
});
```

### Helper Template
```javascript
// src/tests/helpers/my-helper.js
import { pool } from '../../config/db.js';

async function myHelper() {
  // Helper implementation
}

myHelper();
```
