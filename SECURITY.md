# Security Policy

## Supported Versions

MiSeGuard takes deterministic runtime safety and agent execution security seriously. The following table indicates which versions are currently receiving security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability, circuit breaker bypass, parser flaw, or sandbox escape in MiSeGuard, **please do NOT open a public GitHub issue or pull request.**

Please disclose vulnerabilities privately using one of the following channels:

1. **GitHub Private Vulnerability Reporting**:
   Navigate to the **Security** tab of the repository on GitHub and click **"Report a vulnerability"**.

2. **Direct Security Email**:
   Send an encrypted or plain email to the project maintainer:
   - **Contact**: Midhun Sekhar
   - **Email**: `midhunsekhar@gmail.com`
   - **Subject Line**: `[MiSeGuard Security] Vulnerability Report: <Brief Description>`

---

## What to Include in Your Report

To help us triage and resolve the issue quickly, please include:
- A clear description of the vulnerability and its potential blast radius.
- Proof-of-concept (PoC) payload, bash command, or JSON-RPC tool call sequence that demonstrates the bypass.
- The operating system, Node.js version, and MiSeGuard version used during testing.
- Any suggested remediations or patch diffs if available.

---

## Response Timeline & Coordinated Disclosure

- **Initial Response**: We commit to acknowledging receipt of your report within **48 hours**.
- **Assessment & Triage**: We will validate the issue and determine severity within **5 business days**.
- **Remediation & Patch**: A fix will be developed and released in a patch release.
- **Coordinated Disclosure**: We follow coordinated vulnerability disclosure. A public CVE / security advisory will be published only after a patch is released and users have had reasonable time to upgrade.
- **Credit**: Researchers who report confirmed security vulnerabilities will be acknowledged in our release notes (unless anonymity is requested).
