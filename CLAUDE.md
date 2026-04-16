# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Rubber stamp QSO Trainer** — a smartphone-targeted web application for training amateur radio operators in "rubber stamp" QSO (formulaic contact) procedures. The project is in early initialization; no application code has been added yet.

## Intended Stack

The `.gitignore` is configured for a **Next.js** project with TypeScript, suggesting the intended stack:
- Framework: Next.js
- Language: TypeScript
- Deployment target: Vercel (`.vercel` in `.gitignore`)
- Package manager: npm or yarn (Node.js)

## Expected Development Commands

Once the project is bootstrapped (e.g., `npx create-next-app`), the standard commands will be:

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
npm test          # Run tests
```

To run a single test file (once a test runner is configured):
```bash
npx jest path/to/test.file.test.ts
```

## Repository State

- Only `README.md`, `LICENSE` (MIT), and `.gitignore` exist
- No source code, configuration, or tooling is present yet
- First implementation step should be bootstrapping the Next.js app
