# Ampersand — Project Reference

## Overview

Ampersand is a **Tauri + Vue 3 + IonicVue** desktop/mobile app for tracking and journaling people with complex dissociative symptoms (DID, OSDD). It uses Rsbuild as the bundler, IndexedDB (via a custom `shittytable` layer) for local storage, and WebSocket for optional real-time sync.

- **Package**: `moe.ampersand.app`
- **License**: AGPL-3.0-only
- **Package manager**: yarn

---

## Key Tech Stack

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| UI Framework | Vue 3 (Composition API, `<script setup>`)             |
| UI Components| IonicVue (Material Design mode)                       |
| Routing      | Vue Router                                            |
| i18n         | i18next + i18next-vue                                 |
| Bundler      | Rsbuild (rspack under the hood)                       |
| Desktop/Mobile | Tauri (Rust) with several official plugins          |
| Storage      | IndexedDB via custom `shittytable` wrapper            |
| State        | Reactive refs/composables; Tauri Store plugin for persistence |
| Styling      | CSS custom properties + Material 3 color utilities    |
| Icons        | Material Symbols (SVG)                                |
| Linting      | ESLint (flat config) + TypeScript ESLint + Vue plugin + @stylistic |

---

## Directory Structure

```
src/
  app.ts                  # Entry point — sets up Ionic, router, i18n, WebSocket, dark mode
  App.vue                 # Root Vue component
  env.d.ts                # TypeScript environment declarations
  components/             # Reusable UI components (grouped by domain)
  views/                  # Page-level components (Dashboard, Journal, Members, Options, etc.)
  modals/                 # Modal dialog components (edit forms, selectors, etc.)
  router/                 # Route definitions — index, edit, onboarding, options, tabbed, standalone
  lib/                    # Shared business logic
    config/               # App configuration types & defaults
    db/                   # Database layer — entities, events, types, table implementations
    markdown/             # Custom markdown-it / marked extensions (mermaid, SVG, etc.)
    native/               # Tauri-native utilities (cache, file opener, plugin helpers)
    theme/                # M3 color theme generation
    util/                 # Misc utilities (backbutton, blob, md5, filterQuery, image, etc.)
    i18n.ts               # i18next initialization (auto-loads translations/*.json)
    applock.ts            # Biometric app lock
    websocket.ts          # WebSocket sync client
    serialization.ts      # Msgpack serialization (@msgpack/msgpack)
styles/                   # Global CSS, font face declarations
assets/                   # Images, fonts, emoji packs, SVG shapes
translations/             # Per-language JSON files
src-tauri/                # Rust / Tauri backend
  src/                    # lib.rs, main.rs, commands.rs
  plugin/                 # Custom Tauri plugin (Android M3 plugin, iOS support)
  tauri.conf.json         # Tauri bundle config
  Cargo.toml              # Rust dependencies
```

---

## Commands

```bash
yarn install                          # Install dependencies
yarn dev                              # Tauri dev server (Rsbuild + Tauri window)
yarn build                            # Tauri production build (bundles frontend + Rust)
yarn build:rsbuild                    # Frontend-only build (runs vue-tsc + rsbuild build)
yarn eslint src/                      # Run ESLint
```

---

## Coding Conventions

### TypeScript / ESLint

- **Strict mode** enabled; `noUnusedLocals`, `noUnusedParameters`, `strictNullChecks` all on.
- **Indent**: tabs (not spaces). Applies to `.ts`, `.vue` templates, and `<script>` blocks.
- **Quotes**: double quotes always.
- **Semicolons**: always required.
- **Arrow functions**: preferred when using `const` assignments; function declarations also allowed for arrow functions.
- **`eqeqeq`**: `"smart"` mode — allows `== null` and `== undefined` for nullish checks.
- **Unused vars**: prefix with `_` to ignore.
- **Vue files**: use `<script setup lang="ts">` with Composition API.
- **Component names**: multi-word names are **disabled** (`vue/multi-word-component-names: "off"`) — single descriptive names are fine.
- **Floating promises**: `@typescript-eslint/no-floating-promises` is an **error**.

### File Organization

- One `.vue` component per file.
- Co-locate related modals in `src/modals/`.
- Domain-specific components live in subdirectories under `src/components/` (e.g., `journal/`, `member/`, `system/`, `tag/`).
- New routes should be added to the appropriate router file (`src/router/edit.ts`, `onboarding.ts`, etc.).

### Styling

- Use CSS custom properties for theming.
- Material 3 color generation lives in `src/lib/theme/`.
- Ionic components use the `"md"` mode.

### i18n

- Translation JSON files live in `translations/<locale>/*.json`.
- Use `t('key.path')` in Vue templates and `t('key.path')` from `src/lib/i18n.ts` in TS code.
- New strings should be added to the `en` locale first, then translated.

### Database

- Entity definitions are in `src/lib/db/entities.d.ts`.
- Table implementations live in `src/lib/db/impl/` and `src/lib/db/tables/`.
- Use the typed query helpers in `src/lib/db/util/filterQuery.ts`.

### Tauri

- Rust commands are defined in `src-tauri/src/commands.rs`.
- The custom `tauri-plugin-ampersand` handles app-specific native logic.
- Platform-specific code uses Tauri's `#[cfg()]` attributes.

---

## Architecture Notes

1. **Entry flow**: `src/app.ts` initializes Ionic, Vue Router (with lock/onboarding guards), i18n, and a WebSocket client. It mounts to `document.body`.
2. **Route guards**: The router checks for app lock state, onboarding completion, and default view preferences before navigating.
3. **Data layer**: All app data goes through the `lib/db/` layer which abstracts IndexedDB. Entities are typed in `entities.d.ts`.
4. **Sync**: An optional WebSocket connection enables real-time sync between devices. The client is in `lib/websocket.ts`.
5. **Serialization**: App data is serialized with Msgpack (`@msgpack/msgpack`) for compact storage.
6. **Markdown rendering**: Custom extensions support Mermaid diagrams, SVG icons, custom fonts, and image rendering. See `lib/markdown/`.
7. **Theming**: M3 color schemes are generated at runtime from a seed color using `@material/material-color-utilities` and `colorjs.io`.

---

## Platform-Specific Notes

- **Android**: Uses `tauri-plugin-m3` for Media3 audio; handles back button and system insets specially.
- **iOS**: Supports AltStore/SideStore installation; biometric lock via `tauri-plugin-biometric`.
- **Desktop**: Full Tauri bundle (deb, rpm, AppImage, dmg, msi).
- **Security**: HTTPS check and WebKit version validation on startup.

---

## Common Tasks

### Adding a new translation string

1. Add the key to the appropriate namespace in `translations/en/<namespace>.json`.
2. Use `t('namespace.key')` in components.
3. Translators will populate other locale files.

### Adding a new route

1. Define the route in the appropriate `src/router/*.ts` file.
2. Add any needed guard logic in `src/router/index.ts`.
3. Create the view component in `src/views/` or `src/views/<domain>/`.

### Adding a database table

1. Define the entity type in `src/lib/db/entities.d.ts`.
2. Create table implementation in `src/lib/db/tables/<name>.ts`.
3. Register the table in `src/lib/db/impl/`.
4. Use typed query helpers for all operations.

### Building for production

```bash
yarn build:rsbuild   # Frontend
yarn build           # Full Tauri build (frontend + Rust + bundler)
```
