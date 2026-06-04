## Context

RouteList and UpstreamList had been converted to hand-written HTML tables with scoped CSS, but UserList still used Ant Design's `a-table` via the TableCard wrapper component. The EdgeImport preview step was missing a checkbox for plugin_metadata selection. Tools.vue used fixed `:rows="20"` on textareas that didn't respond to viewport changes.

## Goals / Non-Goals

**Goals:**
- UserList table visually matches RouteList/UpstreamList (hand-written `<table>`, consistent CSS)
- UserList delete uses Modal.confirm (consistent with other pages)
- UserList filter bar CSS is identical to UpstreamList
- New user modal resets cluster permissions correctly
- EdgeImport preview has plugin_metadata checkbox + backend support
- Tools.vue textareas fill available height and auto-resize with window

**Non-Goals:**
- No functional changes to delete logic or user CRUD
- No changes to EdgeImport data transformation logic
- No changes to Tools.vue conversion logic (only layout)

## Decisions

1. **Scoped CSS removal for form-input**: UserList had its own `.form-input` scoped CSS with `background: var(--bg)`, differing from the global `var(--surface)`. Removed scoped overrides to use global style.css definitions consistently.

2. **Dynamic rows via JS**: For Tools.vue, using `:rows` binding with a computed value based on `window.innerHeight` rather than CSS `vh` units, because Ant Design's `a-textarea` passes `rows` directly to the native `<textarea>`, making it the most reliable mechanism.

3. **Flex-fill layout for Tools**: Changed the layout chain (tools-layout → tools-content → tool-panel → dual-panel → panel) to propagate `flex: 1` so textareas fill available vertical space, with `overflow: hidden` on intermediate containers to prevent double-scrolling.

4. **Backend plugin_metadata toggle**: Added `plugin_metadata: bool = True` to the existing `ImportSelection` Pydantic model and wrapped the import loop in `if selections.plugin_metadata:`.

## Risks / Trade-offs

- Tools.vue flex layout assumes a consistent number of rows per tool. SM4 has a key-row above the dual-panel that requires separate CSS handling.
- Dynamic `textareaRows` calculation (using `window.innerHeight / 28`) may need adjustment if font-size or line-height changes.
