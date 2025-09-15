# D4AB Constitution

## Core Principles

### I. Extension-First Development
Browser extension is the primary interface; Node.js app provides backend services; Extension must work independently with graceful degradation when backend is unavailable

### II. Security & Privacy
No sensitive data stored in extension storage; All communications use secure channels; User data privacy is paramount - minimal data collection

### III. Test-First (NON-NEGOTIABLE)
TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced for both extension and backend

### IV. Cross-Browser Compatibility
Extension must work on Chrome, Firefox, Safari; Use standard web APIs; Avoid browser-specific features without fallbacks

### V. Performance & Resource Management
Extension should have minimal memory footprint; Background scripts only when necessary; Efficient communication between extension and backend

## Security Requirements

Content Security Policy compliance; No eval() or unsafe code execution; Secure message passing between content scripts and background; Regular security audits

## Development Workflow

Separate testing for extension (using web-ext) and Node.js app; Integration tests for extension-backend communication; Code review required for all changes

## Governance

Constitution supersedes all other practices; All PRs must verify cross-browser compatibility; Performance impact must be measured and justified

**Version**: 1.0.0 | **Ratified**: 2025-09-15 | **Last Amended**: 2025-09-15