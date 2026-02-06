# Contribution Guidelines for Codex Agents

This repository contains the **Cicero_V2** backend (Node.js/Express). Follow these rules when creating pull requests or modifying files.

## Style
- Adhere to the naming conventions in `docs/naming_conventions.md`.
- JavaScript functions and variables use `camelCase`.
- Database table and column names use `snake_case`.
- Place code in the appropriate folder (`src/controller`, `src/service`, etc.).

## Testing
- Run `npm run lint` and `npm test` before committing. Tests rely on Node.js v20+.
- If a command fails because of missing dependencies or network restrictions, note it in the PR under **Testing**.

## Pull Request Notes
- Keep PR titles concise and summarize changes in the body.
- Reference affected file paths and line numbers when relevant.
- Ensure the working tree is clean before submitting.

