# Technology Stack Recommendations

This project involves developing an extension for **VS Code**. It is a fairly traditional project structure for this purpose.

**Stack**: TypeScript 5.4, VS Code Extension API ^1.85.0, Node.js 20.11.30

## TypeScript

- Use explicit typing, avoid `any`
- Import types from `vscode` namespace for extension API
- Use enums and union types for states (see `models/`)

## Webview

- Always use CSP nonce for inline scripts/styles
- Handle messages from webview through typed message handlers
- Use `postMessage` instead of direct DOM manipulations to update UI after state changes

## Testing

The project does not have automated tests. Testing is done through Extension Development Host (F5) by the user.
<!-- lg:if tag:claude-code -->
## File Paths

This project runs on Windows. When using Read/Edit/Write tools, always use **backslashes** (`\`) in file paths.
<!-- lg:endif -->