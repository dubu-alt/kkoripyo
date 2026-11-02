---
description: Rules for preparing and creating commits.
apply: workflow
read_when:
  - suggesting commit messages
  - preparing or creating commits
---

# Commit Guidelines

- Use Conventional Commits.
- Write concise, specific commit messages in Korean.
- Split commits by logical change when practical.
- Do not commit or push unless explicitly requested by the user.
- When the user asks for commit guidance, provide exact `git add` and `git commit` commands.
- Exclude unrelated changes from suggested `git add` commands.

## Commit Types

- `feat`: add a new feature
- `fix`: fix a bug
- `refactor`: improve code structure without changing behavior
- `style`: change formatting or other details that do not affect code behavior
- `docs`: add or update documentation
- `test`: add or update tests
- `chore`: update the development environment, dependencies, or other configuration

## Examples

```txt
feat: 개인정보 노출 리포트 화면 추가
fix: 분석 요청 실패 시 오류 처리 수정
refactor: API 응답 검증 로직 분리
docs: 프로젝트 개발 가이드 수정
chore: 프로젝트 기본 설정 정리
```
