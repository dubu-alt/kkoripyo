# Project Guidelines

## Project Overview

- Build an AI-powered SNS privacy manager using React and Vite.
- The MVP lets users request an Instagram privacy analysis and view exposure risks, supporting evidence, and recommended protective actions.
- A separate backend handles data collection and AI analysis.

## Tech Stack

- React
- Vite
- TypeScript
- React Router
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Fetch API
- Zod

## Before Coding

- For feature implementation, code changes, or refactoring requests, read `.agents/workflow.md` and follow its workflow.
- Check the installed React and Vite versions before changing framework-specific code.
- Prefer existing project patterns over introducing new abstractions.
- Keep changes scoped to the requested task.

## Commands

- `npm run dev` - start the local development server.
- `npm run build` - build the app for production.
- `npm run preview` - preview the production build locally.
- `npm run typecheck` - run TypeScript checks.
- `npm run lint` - run ESLint.
- `npm run format:check` - check formatting.
- `npm run check` - run the project checks.
- When initializing the app, register these scripts in `package.json`.
- Use `npm run check` as the final verification command before reporting that code changes are complete. If the app or scripts have not been set up yet, report that verification is unavailable.

## Code Style

- Use TypeScript.
- Use function components and React Hooks.
- Follow the Rules of Hooks and keep each component's responsibilities focused.
- Use the project's existing routing solution when routing is needed.
- Use `clsx` and `tailwind-merge` through a shared `cn()` utility when available.
- Use Zod for environment variable validation and important runtime data validation.
- Prefer shadcn/ui components before writing custom UI primitives.
- When adding or updating shadcn/ui components, use `npx shadcn@latest` and review the generated files.
- Use semantic Tailwind tokens from the design system instead of raw color utilities when styling shadcn/ui-based UI.
- Keep local UI state in React. Add a global state library only when a concrete requirement justifies it.

## API

- The backend server is separate from the React app.
- Use the native Fetch API for backend HTTP requests in the MVP.
- Check `response.ok` and throw on unsuccessful HTTP responses so TanStack Query can handle errors.
- Use TanStack Query for client-side server state.
- Do not hardcode API URLs; read them from environment variables.
- Access client environment variables through `import.meta.env` and use the `VITE_` prefix.
- Treat `VITE_` variables as public. Never store API keys, access tokens, or other secrets in them.
- Keep data collection credentials and AI provider credentials on the backend.
- Handle loading, empty, partial-result, and error states explicitly.

## Git

- Follow `.agents/commit-conventions.md` for commit-related work.
