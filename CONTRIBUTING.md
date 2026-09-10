# Contributing to MiSeGuard

Thank you for your interest in contributing to **MiSeGuard**! We welcome contributions from systems engineers, AI developers, and DevSecOps practitioners to help make autonomous AI agent runtimes safer and more deterministic.

---

## 🛠️ Quick Local Setup

### Prerequisites
- Node.js 18.x, 20.x, or 22.x
- npm 9.x or higher

### Steps

```bash
# 1. Clone your fork
git clone https://github.com/your-username/miseguard.git
cd miseguard

# 2. Install dependencies
npm install

# 3. Build TypeScript codebase
npm run build

# 4. Run test suite
npm test

# 5. Run latency benchmark
npm run benchmark
```

---

## 📐 Development Guidelines

1. **Deterministic Design**:
   MiSeGuard is built on deterministic, mathematically bounded risk scoring. Do not introduce non-deterministic external network calls, heavy LLM re-prompting, or heuristic delays into the hot proxy path.

2. **Ultra-Low Latency Overhead**:
   MiSeGuard maintains a sub-millisecond proxy overhead (< 0.1 ms). Every new parser rule or check must be fast, allocation-efficient, and benchmarked with `npm run benchmark`.

3. **Platform Agnostic**:
   All filesystem and path operations must work consistently across Linux, macOS, and Windows. Use normalized path helpers and `picomatch` for glob matching.

4. **Code Quality**:
   - Write strict, type-safe TypeScript.
   - Maintain comprehensive unit test coverage for new rules, commands, or edge cases.

---

## 🧪 Testing

We use Node.js's built-in test runner with `tsx`:

```bash
# Run all tests
npm test

# Run tests in watch/dev mode
npx tsx --test tests/parser.test.ts
npx tsx --test tests/blast-radius.test.ts
npx tsx --test tests/config.test.ts
npx tsx --test tests/wrapper.test.ts
```

---

## 📋 Pull Request Checklist

Before submitting a Pull Request, please ensure:

- [ ] `npm run build` compiles without errors or warnings.
- [ ] `npm test` passes all tests cleanly across all test suites.
- [ ] `npm run benchmark` verifies proxy overhead remains sub-millisecond.
- [ ] New security rules or CLI options are covered with unit tests in `tests/`.
- [ ] Documentation (`README.md`, `CHANGELOG.md`) is updated if user-facing behavior changes.
- [ ] Commit messages are clear and follow standard conventional commit conventions (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

---

## 📜 Code of Conduct

Please note that this project is released with a Contributor [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
