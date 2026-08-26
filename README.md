# OpenHome

OpenHome is a React and TypeScript desktop application built with Vite and Tauri.

## Development

```bash
pnpm install
pnpm tauri:dev
```

`tauri:dev` starts Vite and launches the native desktop window.

## Windows Build

Build the Windows installer on a Windows machine with Rust installed with the `stable-x86_64-pc-windows-msvc` toolchain, Microsoft C++ Build Tools (including the Windows SDK), and the Microsoft Edge WebView2 Runtime.

```bash
pnpm install
pnpm tauri:build
```

Tauri writes Windows installer artifacts under `src-tauri/target/release/bundle/`.

## Frontend Tooling

The frontend uses React, TypeScript, Vite, and Oxlint. Two official Vite React plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
