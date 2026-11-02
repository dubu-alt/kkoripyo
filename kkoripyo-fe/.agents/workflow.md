---
description: Steps for handling implementation requests and assigning sub-agent roles.
apply: implementation
read_when:
  - implementing a feature
  - modifying or refactoring existing code
---

# Implementation Workflow

## Core Principles

- When the user requests implementation, inspect the relevant code and carry the task through implementation, verification, and reporting.
- Identify the scope and completion criteria, and prioritize existing structures and patterns.
- When requirements are clear, proceed without waiting for separate approval to start.
- If essential information is missing, ask the user and continue any work that does not depend on the answer.
- Preserve the user's existing changes and avoid unrelated modifications.
- An implementation request alone does not authorize commits or pushes.

## Agent Roles

Role names describe how work is divided; they are not model names.

- Unless the user specifies a model, inherit the main agent's model settings, but never use Astra-family models for sub-agents.
- If the main agent uses an Astra-family model, explicitly select an available model from another family for sub-agents.

- Main agent: clarify requirements, inspect existing code, assign work, implement core changes, integrate results, perform final verification, and report the outcome.
- Implementation agent: handle independent implementation tasks assigned by the main agent and modify files only within the assigned scope.
- Review agent: use the `vercel-react-best-practices` skill to review React code and check for missing requirements, potential bugs, regression risks, and gaps in verification. Do not modify files.

## When to Use Sub-Agents

- For features spanning multiple files, delegate the post-implementation review to a review agent by default.
- Delegate independent implementation tasks to implementation agents when they can be separated.
- The main agent handles simple text changes, document translations, and small configuration updates directly when delegation offers little benefit.
- Run only roles with concrete work to perform, and stay within the environment's concurrency limits.
- Briefly tell the user which sub-agent roles will be used and what they will handle.
- If sub-agent tools are unavailable or the work cannot be separated effectively, the main agent handles those responsibilities as well.

## Steps

### 1. Understand the Request and Existing Code

- Read `AGENTS.md` and any additional guides relevant to the task.
- Inspect existing working directory changes.
- Define the requested behavior, scope of changes, and completion criteria.
- The main agent directly inspects relevant files, existing patterns, reusable code, and the impact of the changes.
- The main agent decides the implementation approach based on requirements, constraints, and the existing code.

### 2. Assign Work

- Before implementation, briefly explain the work sequence and which sub-agent roles will be used.
- For each delegated task, specify its purpose, permitted files or directories, applicable rules, and completion criteria.
- Assign ownership so multiple agents do not edit the same file concurrently.
- Define shared types or interface contracts before separating tasks that depend on them.
- The main agent also takes on implementation work and avoids duplicating work assigned to sub-agents.

### 3. Implement and Integrate

- Implement only the requested scope using existing patterns.
- Briefly share significant findings or decisions with the user as work progresses.
- Sub-agents report their changes, verification results, and remaining issues to the main agent.
- The main agent directly reviews delegated changes and integrates them with the overall behavior.

### 4. Review and Verify

- Provide the review agent with the request, change scope, and completion criteria.
- The review agent reads the `vercel-react-best-practices` skill's `SKILL.md` and the rules relevant to the changes before reviewing.
- Apply rules relevant to React and Vite; do not apply Next.js-only rules.
- Evaluate review findings against the code and requirements, then make necessary corrections.
- Perform verification appropriate to the changes. If the UI changed, check the relevant screens in a browser when the environment supports it.
- After code changes, run `npm run check` as the final verification command.
- Investigate and fix verification failures. Report any checks that could not be run and explain why.
- Do not mark work complete based only on sub-agent reports; the main agent verifies the final result.

### 5. Report Results

- Briefly describe what was implemented and the verification results.
- Include any incomplete work or limitations that require the user's attention.
