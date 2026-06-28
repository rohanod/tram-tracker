// Vehicle Tracker app CSS. Kept as raw CSS for Lakebed.
export const APP_CSS = `
:root {
  --page: var(--mut-page);
  --page-alt: var(--mut-page-alt);
  --inset: var(--mut-inset);
  --surface: var(--mut-surface);
  --surface-raised: var(--color-surface-elevated);
  --accent: var(--mut-accent);
  --accent-strong: var(--mut-accent-strong);
  --accent-soft: var(--mut-accent-soft);
  --line-12: #f5a300;
  --line-14: #5a1e82;
  --line-17: #00ace7;
  --line-18: #b82f89;
  --text: var(--mut-text);
  --text-strong: var(--mut-text-strong);
  --text-secondary: var(--mut-text-secondary);
  --text-muted: var(--mut-text-muted);
  --text-placeholder: var(--mut-text-placeholder);
  --border: var(--mut-border);
  --border-strong: var(--color-border-strong);
  --danger: var(--mut-danger);
  --focus: var(--color-ring);
  --ease-soft: var(--cubic-move);
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

button,
select,
input {
  -webkit-tap-highlight-color: transparent;
}

.app-shell {
  min-height: 100dvh;
  background: var(--page-alt);
  color: var(--text);
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
  padding: 18px;
}

.utility {
  position: relative;
  width: min(100%, 1180px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  align-items: start;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--mut-radius-shell);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-100);
}

.utility::before {
  content: "";
  grid-column: 1;
  grid-row: 2;
  align-self: stretch;
  min-height: calc(100dvh - 36px);
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.topbar {
  display: grid;
  grid-column: 1 / -1;
  grid-row: 1;
  position: relative;
  z-index: 1;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  padding: 12px 14px;
}

.topbar-compact {
  justify-content: stretch;
}

.topbar-status {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.rail-title {
  display: grid;
  gap: 2px;
}

.rail-title strong {
  font-size: 0.95rem;
  line-height: 1;
}

.rail-title span {
  color: var(--text-muted);
  font-size: 0.82rem;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 1.95rem;
  line-height: 1.1;
  letter-spacing: 0;
  font-weight: 650;
}

h2 {
  font-size: 1rem;
  line-height: 1.3;
  font-weight: 650;
}

.topbar p,
.subtle,
.entry-main p,
.entry-meta,
.empty-state,
.auth-panel p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.45;
}

.session {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.86rem;
  min-height: 36px;
  width: fit-content;
  padding: 0 12px;
  white-space: nowrap;
}

.sync-summary {
  color: var(--text-muted);
  font-size: 0.82rem;
  white-space: nowrap;
}

.account-summary {
  color: var(--text-secondary);
  font-size: 0.82rem;
  white-space: nowrap;
}

.topbar-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.topbar-action {
  min-height: var(--control-size-lg);
  border: 1px solid var(--color-border-primary-outline);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  padding: 0 10px;
  font-size: var(--menu-font-size);
  line-height: var(--menu-line-height);
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

.topbar-action:hover {
  background: var(--menu-item-background-color);
}

.topbar-action:disabled {
  opacity: 0.48;
}

.app-tabs {
  grid-column: 1;
  grid-row: 2;
  position: relative;
  z-index: 1;
  display: grid;
  align-content: start;
  gap: 6px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 18px 10px;
}

.app-tab {
  min-height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  border: 0;
  border-radius: var(--mut-radius-active);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: var(--segmented-control-font-weight);
  transition: background-color var(--transition-duration-basic) var(--ease-soft), border-color var(--transition-duration-basic) var(--ease-soft), color var(--transition-duration-basic) var(--ease-soft), transform var(--transition-duration-basic) var(--ease-soft);
}

.workspace {
  grid-column: 2;
  grid-row: 2;
  position: relative;
  z-index: 1;
  display: grid;
  align-content: start;
  gap: 14px;
  border: 0;
  border-radius: 0;
  background: var(--surface);
  padding: 18px;
  min-height: calc(100dvh - 87px);
}

.save-panel,
.review-panel,
.history-panel {
  min-width: 0;
}

.app-tab.active {
  background: var(--color-background-primary-solid);
  color: var(--color-text-primary-solid);
}

.app-tab:last-child {
  border-right: 0;
}

.app-tab:active {
  transform: translateY(1px);
}

.tab-glyph {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.78rem;
  line-height: 1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-muted);
}

.status-dot.online {
  background: var(--accent);
}

.save-panel,
.auth-panel,
.home-panel,
.history-panel {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
}

.save-panel {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  grid-template-areas:
    "capture line"
    "action line"
    "message line";
  gap: 18px;
  align-items: start;
  min-height: 450px;
}

.home-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
}

.home-panel h2 {
  font-size: 1.35rem;
}

.compact-primary {
  min-height: 42px;
  padding: 0 18px;
}

.save-backdrop {
  z-index: var(--z-modal-backdrop);
  align-items: start;
  background: oklch(0.16 0.006 255 / 0.28);
  backdrop-filter: blur(6px);
}

.save-dialog {
  width: min(100%, 920px);
  max-height: calc(100dvh - 36px);
  overflow: auto;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  border: 1px solid var(--border-strong);
  border-radius: var(--mut-radius-shell);
  background: var(--surface);
  box-shadow: var(--shadow-300);
  padding: 18px;
}

.save-dialog-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
}

.auth-panel {
  display: grid;
  gap: 12px;
}

.auth-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.auth-panel-actions > * {
  flex: 1 1 160px;
}

.history-panel {
  margin-top: 0;
  border-top: 1px solid var(--border);
  padding-top: 14px;
  min-height: 110px;
}

.field-row {
  display: grid;
  gap: 6px;
}

.field-label {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 760;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vehicle-input,
.entry-actions select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: var(--mut-radius-panel);
  background: var(--surface);
  color: var(--text);
  outline: none;
}

.vehicle-input {
  min-height: 118px;
  border-color: var(--input-outline-border-color);
  background: var(--input-soft-background-color);
  color: var(--input-text-color);
  padding: 0 18px;
  font-size: 4.4rem;
  font-weight: 820;
  letter-spacing: 0;
}

.vehicle-input::placeholder {
  color: var(--input-placeholder-text-color);
}

.vehicle-input:focus,
.entry-actions select:focus {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
  border-color: var(--input-outline-border-color-focus);
}

button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.capture-layout {
  display: grid;
  grid-area: capture;
  grid-template-columns: 1fr;
  gap: 18px;
}

.capture-card,
.default-card,
.line-panel {
  display: grid;
  align-content: start;
  gap: 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.capture-card {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.line-panel {
  grid-area: line;
  min-height: 100%;
  border-left: 1px solid var(--border);
  padding-left: 18px;
}

.capture-card .field-label {
  color: var(--text-muted);
}

.capture-card .observation-option {
  border-color: var(--border);
}

.capture-card .observation-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--color-text-primary-solid);
}

.location-row,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading {
  margin-bottom: 8px;
}

.section-heading.compact {
  margin-bottom: 0;
  align-items: flex-end;
}

.section-heading span {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.location-warning {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid oklch(0.58 0.12 70 / 0.34);
  border-radius: var(--mut-radius-control);
  background: oklch(0.98 0.02 82);
  color: oklch(0.33 0.08 65);
  padding: 10px;
}

.location-warning.denied {
  border-color: oklch(0.52 0.17 34 / 0.42);
  background: oklch(0.98 0.018 48);
  color: oklch(0.34 0.11 34);
}

.location-warning strong {
  display: block;
  font-size: 0.86rem;
  line-height: 1.2;
}

.location-warning p {
  margin-top: 3px;
  color: currentColor;
  font-size: 0.82rem;
  line-height: 1.35;
}

.location-warning .secondary-button {
  flex: 0 0 auto;
  background: var(--surface);
}

.observation-grid,
.leg-grid,
.main-line-grid {
  display: grid;
  gap: 8px;
}

.observation-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.leg-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.main-line-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.observation-option,
.leg-option,
.line-swatch,
.other-line-button,
.entry-leg-option,
.entry-line-option,
.entry-other-line-button,
.secondary-button,
.link-button,
.entry-actions button {
  border: 1px solid var(--color-border-primary-outline);
  border-radius: var(--mut-radius-control);
  background: var(--surface);
  color: var(--text);
  min-height: var(--control-size-lg);
  padding: 0 var(--control-gutter-lg);
  cursor: pointer;
  transition: background-color var(--transition-duration-basic) var(--ease-soft), border-color var(--transition-duration-basic) var(--ease-soft), color var(--transition-duration-basic) var(--ease-soft), transform var(--transition-duration-basic) var(--ease-soft), box-shadow var(--transition-duration-basic) var(--ease-soft);
}

.observation-option,
.leg-option,
.entry-leg-option {
  min-height: 46px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 640;
}

.observation-option.active,
.leg-option.active,
.entry-leg-option.active,
.primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--color-text-primary-solid);
}

.line-swatch {
  min-height: 62px;
  border-width: 2px;
  font-size: 1.38rem;
  font-weight: 820;
}

.line-swatch:not(.active) {
  background: var(--surface);
}

.line-swatch.active,
.entry-line-option.active,
.other-line-chip.active {
  box-shadow: inset 0 0 0 2px currentColor;
}

.other-line-button {
  min-height: 62px;
  grid-column: 1 / -1;
  border-color: var(--text);
  font-weight: 720;
  color: var(--text-secondary);
}

.other-line-button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.other-line-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--mut-radius-panel);
  background: var(--surface);
  padding: 8px;
}

.other-line-chip {
  min-height: 56px;
  display: grid;
  align-content: center;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--mut-radius-control);
  background: var(--surface);
  cursor: pointer;
  padding: 7px 8px;
  text-align: left;
  transition: background-color var(--transition-duration-fast) var(--ease-soft), border-color var(--transition-duration-fast) var(--ease-soft), color var(--transition-duration-fast) var(--ease-soft);
}

.other-line-chip strong {
  font-size: 1.02rem;
  line-height: 1;
}

.other-line-chip span {
  font-size: 0.68rem;
  line-height: 1.15;
  color: currentColor;
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-button {
  min-height: 58px;
  border-radius: var(--mut-radius-control);
  border: 1px solid var(--accent);
  cursor: pointer;
  font-weight: var(--button-font-weight);
  transition: background-color var(--transition-duration-basic) var(--ease-soft), border-color var(--transition-duration-basic) var(--ease-soft), transform var(--transition-duration-basic) var(--ease-soft);
}

.save-panel > .primary-button {
  grid-area: action;
}

.save-panel > .message-text,
.save-panel > .error-text {
  grid-area: message;
}

.primary-button:active,
.secondary-button:active,
.observation-option:active,
.leg-option:active,
.line-swatch:active,
.other-line-button:active,
.other-line-chip:active {
  transform: translateY(1px);
}

.primary-button:hover {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
}

.auth-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.secondary-button:hover,
.observation-option:hover,
.leg-option:hover,
.line-swatch:hover,
.other-line-button:hover,
.other-line-chip:hover,
.entry-leg-option:hover,
.entry-line-option:hover,
.entry-other-line-button:hover,
.entry-actions button:hover {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text);
}

@media (hover: none) {
  .secondary-button:hover,
  .observation-option:hover,
  .leg-option:hover,
  .line-swatch:hover,
  .other-line-button:hover,
  .other-line-chip:hover,
  .entry-leg-option:hover,
  .entry-line-option:hover,
  .entry-other-line-button:hover,
  .entry-actions button:hover,
  .map-mode-toggle button:hover,
  .map-controls button:hover,
  .mapcn-controls button:hover {
    background: var(--surface);
  }
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.link-button {
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: var(--mut-radius-control);
  padding: 0 10px;
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 650;
}

.link-button:hover {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--text);
}

.message-text,
.error-text {
  font-size: 0.9rem;
  line-height: 1.4;
}

.message-text {
  color: var(--accent);
}

.error-text {
  color: var(--danger);
}

.entry-list {
  list-style: none;
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
}

.review-panel {
  display: grid;
  gap: 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  min-height: 560px;
}

.review-header,
.review-results {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.review-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(0, 0.75fr));
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--mut-radius-panel);
  background: var(--surface);
  padding: 10px;
}

.review-filters label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.review-filters span {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.review-filters input,
.review-filters select {
  width: 100%;
  min-height: var(--control-size-lg);
  border: 1px solid var(--input-outline-border-color);
  border-radius: var(--mut-radius-control);
  background: var(--input-soft-background-color);
  color: var(--input-text-color);
  padding: 0 10px;
  outline: none;
}

.review-filters input:focus,
.review-filters select:focus {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
  border-color: var(--input-outline-border-color-focus);
}

.review-filters label:first-child input {
  min-height: 58px;
  font-size: 1.8rem;
  font-weight: 760;
}

.review-results {
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.review-list {
  content-visibility: auto;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.pagination span {
  min-width: 52px;
  text-align: center;
  font-weight: 700;
}

.heading-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.small-button {
  min-height: 32px;
  border-radius: var(--mut-radius-control);
  font-size: 0.8rem;
}

.sync-pill {
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: var(--badge-font-weight-md);
  white-space: nowrap;
}

.sync-pill.synced {
  border-color: oklch(0.78 0.09 152);
  color: oklch(0.38 0.1 152);
}

.entry-row {
  display: grid;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  padding: 12px;
}

.entry-row.deleting {
  opacity: 0.55;
}

.entry-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.entry-main div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.entry-main strong {
  font-size: 1.48rem;
  letter-spacing: 0;
  line-height: 1;
}

.entry-main span {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.entry-main p {
  max-width: 50%;
  text-align: right;
  overflow-wrap: anywhere;
}

.entry-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.entry-summary-grid div {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--inset);
  padding: 7px 9px;
}

.entry-summary-grid span {
  display: block;
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 650;
}

.entry-summary-grid strong {
  display: block;
  margin-top: 2px;
  color: var(--text);
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-leg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 6px;
}

.entry-leg-option {
  min-height: 36px;
  border-radius: 12px;
  font-size: 0.82rem;
}

.entry-line-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.entry-line-option,
.entry-other-line-button {
  min-height: 36px;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 760;
  padding: 0 7px;
}

.entry-other-line-button {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.entry-other-line-button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.entry-other-lines {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  gap: 6px;
  max-height: 150px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  padding: 6px;
}

.entry-other-lines .other-line-chip {
  min-height: 46px;
  border-radius: 11px;
  padding: 6px;
}

.entry-other-lines .other-line-chip strong {
  font-size: 0.92rem;
}

.entry-other-lines .other-line-chip span {
  font-size: 0.62rem;
}

.entry-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 8px;
}

.entry-actions select {
  min-height: 38px;
  padding: 0 9px;
  font-size: 0.9rem;
}

.entry-actions button:last-child {
  color: var(--danger);
  border-color: oklch(0.72 0.08 28 / 0.55);
}

.entry-actions button:last-child:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: oklch(0.985 0.012 28);
}

.empty-state {
  border: 1px dashed var(--border);
  border-radius: 18px;
  background: var(--inset);
  padding: 16px;
}

.edit-dialog {
  width: min(100%, 680px);
  max-height: calc(100dvh - 36px);
  overflow: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--surface);
  padding: 12px;
}

.edit-dialog-header {
  position: sticky;
  top: -12px;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: -12px -12px 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  padding: 12px;
}

.edit-dialog-header .secondary-button {
  min-height: 38px;
  padding: 0 14px;
  white-space: nowrap;
}

.edit-section {
  display: grid;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--inset);
  padding: 10px;
}

.edit-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.coordinate-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.coordinate-grid label {
  display: grid;
  gap: 5px;
}

.coordinate-grid span {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.coordinate-grid input {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  padding: 0 10px;
  outline: none;
}

.coordinate-grid input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
  border-color: var(--accent);
}

.edit-inline-actions,
.dialog-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.edit-primary-actions {
  display: grid;
}

.dialog-actions .primary-button,
.dialog-actions .secondary-button {
  min-height: 46px;
}

.edit-primary-actions .primary-button {
  min-height: 48px;
}

.danger-zone {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid oklch(0.82 0.065 28);
  border-radius: 14px;
  background: oklch(0.985 0.012 28);
  padding: 10px;
}

.danger-title {
  margin: 0 0 2px;
  color: var(--danger);
  font-weight: 750;
}

.danger-button {
  min-height: 40px;
  border: 1px solid var(--danger);
  border-radius: 12px;
  background: var(--surface);
  color: var(--danger);
  padding: 0 16px;
  font-weight: 750;
  cursor: pointer;
}

.danger-button.solid {
  background: var(--danger);
  color: white;
}

.danger-button:hover {
  background: oklch(0.96 0.032 28);
}

.danger-button.solid:hover {
  background: oklch(0.44 0.14 28);
}

.danger-button:focus-visible {
  outline: 2px solid oklch(0.7 0.12 28 / 0.42);
  outline-offset: 2px;
}

.danger-confirm-actions {
  display: grid;
  grid-template-columns: auto auto;
  gap: 8px;
}

.compact-message {
  font-size: 0.82rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: oklch(0.16 0.006 255 / 0.34);
  overflow: auto;
  padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
}

.confirm-backdrop {
  z-index: 45;
}

.confirm-dialog {
  width: min(100%, 420px);
  display: grid;
  gap: 14px;
  border: 1px solid var(--border-strong);
  border-radius: 18px;
  background: var(--surface);
  padding: 16px;
}

.confirm-dialog h2 {
  font-size: 1.05rem;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.confirm-actions .secondary-button,
.confirm-actions .danger-button {
  min-height: 44px;
}

.map-dialog {
  width: min(100%, 740px);
  max-height: min(88vh, 760px);
  overflow: auto;
  display: grid;
  gap: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  padding: 14px;
}

.map-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-map {
  position: relative;
  min-height: 320px;
  height: min(52vh, 440px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: oklch(0.91 0.01 240);
  touch-action: manipulation;
}

.review-map.editable {
  cursor: crosshair;
  touch-action: none;
}

.mapcn-shell {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--inset);
}

.mapcn-map {
  position: relative;
  min-height: 320px;
  height: min(52vh, 460px);
  background: oklch(0.94 0.008 247);
}

.mapcn-map.editable {
  cursor: crosshair;
}

.location-edit-map {
  display: grid;
  gap: 6px;
}

.location-edit-map .mapcn-map,
.location-edit-map .review-map {
  min-height: 260px;
  height: min(42vh, 340px);
}

.mapcn-loader {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: oklch(1 0 0 / 0.58);
  backdrop-filter: blur(3px);
}

.mapcn-loader span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-muted);
  animation: mapcn-pulse 900ms ease-in-out infinite;
}

.mapcn-loader span:nth-child(2) {
  animation-delay: 140ms;
}

.mapcn-loader span:nth-child(3) {
  animation-delay: 280ms;
}

.map-mode-toggle {
  position: absolute;
  left: 10px;
  top: 10px;
  z-index: 6;
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: oklch(1 0 0 / 0.96);
}

.map-mode-toggle button {
  min-height: 32px;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  padding: 0 10px;
  font-size: 0.74rem;
  font-weight: 650;
  cursor: pointer;
}

.map-mode-toggle button:last-child {
  border-right: 0;
}

.map-mode-toggle button:hover {
  background: var(--surface-raised);
}

.map-mode-toggle button.active {
  background: var(--accent);
  color: white;
}

.map-tile {
  position: absolute;
  width: 256px;
  height: 256px;
  user-select: none;
}

.map-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.route-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 4;
  opacity: 0.9;
}

.stop-dot {
  stroke: var(--surface);
  stroke-width: 1.4;
  opacity: 0.95;
}

.route-line.line-14 { stroke: var(--line-14); }
.route-line.line-18 { stroke: var(--line-18); }
.route-line.line-12 { stroke: var(--line-12); }
.route-line.line-17 { stroke: var(--line-17); }

.stop-dot.line-14 { fill: var(--line-14); }
.stop-dot.line-18 { fill: var(--line-18); }
.stop-dot.line-12 { fill: var(--line-12); }
.stop-dot.line-17 { fill: var(--line-17); }

.capture-range {
  fill: oklch(0.52 0.19 264 / 0.28);
  stroke: oklch(0.42 0.18 264);
  stroke-width: 2.4;
}

.capture-range-halo {
  fill: none;
  stroke: oklch(1 0 0 / 0.82);
  stroke-width: 5;
}

.saved-marker circle:first-child {
  fill: oklch(1 0 0 / 0.65);
  stroke: var(--accent);
  stroke-width: 3;
}

.saved-marker circle:last-child {
  fill: var(--accent);
}

.map-attribution {
  position: absolute;
  right: 6px;
  bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: oklch(1 0 0 / 0.88);
  padding: 2px 6px;
  font-size: 0.66rem;
}

.map-attribution a {
  color: var(--text-secondary);
}

.toast {
  position: fixed;
  right: max(18px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(420px, calc(100vw - 28px));
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--text);
  color: var(--surface);
  padding: 10px 10px 10px 12px;
  font-size: 0.88rem;
  line-height: 1.35;
}

.toast button {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid oklch(1 0 0 / 0.24);
  border-radius: 10px;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.map-controls {
  position: absolute;
  left: 8px;
  top: 8px;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: oklch(1 0 0 / 0.94);
}

.map-controls button,
.map-controls span {
  width: 36px;
  min-height: 34px;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 650;
}

.map-controls button {
  cursor: pointer;
}

.map-controls button:hover {
  background: var(--surface-raised);
}

.map-controls span {
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 650;
}

.map-controls button:last-child {
  border-right: 0;
}

.mapcn-controls {
  position: absolute;
  right: 10px;
  bottom: 36px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: oklch(1 0 0 / 0.96);
}

.mapcn-controls button {
  width: 34px;
  height: 34px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.mapcn-controls button:last-child {
  border-bottom: 0;
}

.mapcn-controls button:hover {
  background: var(--surface-raised);
}

.mapcn-controls button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -3px;
}

.mapcn-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.mapcn-controls svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.mapcn-marker {
  position: relative;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  cursor: pointer;
  transform: translateY(-1px);
}

.mapcn-marker-pulse,
.mapcn-marker-dot {
  position: absolute;
  inset: 0;
  border-radius: 999px;
}

.mapcn-marker-pulse {
  background: oklch(0.514 0.101 259.6 / 0.18);
  border: 2px solid oklch(1 0 0 / 0.78);
}

.mapcn-marker-dot {
  inset: 7px;
  background: var(--accent);
}

.mapcn-edit-marker {
  width: 30px;
  height: 30px;
  border: 3px solid white;
  border-radius: 999px;
  background: oklch(0.52 0.19 264 / 0.96);
  box-shadow: 0 0 0 3px oklch(0.42 0.18 264 / 0.45);
  cursor: grab;
}

.mapcn-edit-marker:active {
  cursor: grabbing;
}

.fallback-edit-marker {
  fill: oklch(0.52 0.19 264 / 0.96);
  stroke: white;
  stroke-width: 3;
  filter: drop-shadow(0 1px 2px oklch(0.2 0.02 260 / 0.3));
}

.fallback-edit-marker path {
  fill: none;
  stroke: white;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.mapcn-popup {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: oklch(1 0 0 / 0.96);
  color: var(--text);
  padding: 8px 10px;
  font-size: 0.84rem;
  font-weight: 650;
}

.maplibregl-popup-content {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.maplibregl-popup-tip {
  display: none !important;
}

.mapcn-range-label {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 5;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: oklch(1 0 0 / 0.94);
  color: var(--text-secondary);
  padding: 5px 9px;
  font-size: 0.72rem;
  font-weight: 650;
}

.mapcn-range-label.fallback {
  pointer-events: none;
}

.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-line {
  width: 24px;
  height: 4px;
  border-radius: 999px;
}

.legend-line.line-14 { background: var(--line-14); }
.legend-line.line-18 { background: var(--line-18); }
.legend-line.line-12 { background: var(--line-12); }
.legend-line.line-17 { background: var(--line-17); }

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-muted);
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
  margin: 0;
}

.result-grid div {
  min-width: 0;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.result-grid dt {
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 650;
}

.result-grid dd {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .app-shell {
    background: var(--surface);
    padding: 0;
  }

  .utility {
    width: 100%;
    min-height: 100dvh;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0;
    border: 0;
    border-radius: 0;
    background: var(--surface);
    box-shadow: none;
  }

  .utility::before {
    display: none;
  }

  .workspace {
    grid-column: auto;
    grid-row: auto;
    min-height: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }

  .topbar,
  .entry-main,
  .review-header,
  .review-results,
  .location-row,
  .home-panel,
  .capture-layout {
    display: grid;
  }

  .topbar {
    grid-column: auto;
    grid-row: auto;
    gap: 10px;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding: max(10px, env(safe-area-inset-top)) 10px 9px;
  }

  .rail-title {
    display: none;
  }

  .topbar-compact {
    grid-template-columns: minmax(0, 1fr) auto;
    justify-content: stretch;
  }

  .topbar-status {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    justify-content: stretch;
    width: 100%;
  }

  .sync-summary,
  .account-summary {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .account-summary {
    grid-column: 1 / -1;
  }

  h1 {
    font-size: 1.45rem;
  }

  .topbar p,
  .subtle,
  .entry-main p,
  .entry-meta,
  .empty-state,
  .auth-panel p {
    font-size: 0.86rem;
  }

  .session {
    justify-content: start;
    width: fit-content;
    flex-wrap: nowrap;
    min-height: 0;
    padding: 8px 11px;
  }

  .topbar-menu {
    justify-self: end;
  }

  .menu-panel {
    right: 0;
    left: auto;
  }

  .app-tabs {
    grid-column: auto;
    grid-row: auto;
    position: relative;
    z-index: 2;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    padding: 0;
  }

  .app-tab {
    justify-content: center;
    min-height: 48px;
    border-radius: 0;
    flex-direction: row;
    gap: 7px;
    font-size: 0.86rem;
  }

  .app-tab .tab-glyph {
    display: none;
  }

  .app-tab.active {
    background: var(--color-background-primary-soft-alpha);
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--text);
  }

  .toast {
    right: 10px;
    bottom: max(10px, env(safe-area-inset-bottom));
    left: 10px;
    max-width: none;
  }

  .save-panel > .primary-button {
    margin-bottom: 0;
  }

  .history-panel {
    margin-top: 0;
  }

  .save-panel,
  .home-panel,
  .auth-panel,
  .history-panel,
  .review-panel {
    border-radius: 16px;
    padding: 8px;
  }

  .home-panel {
    grid-template-columns: 1fr;
    gap: 10px;
    border-bottom: 1px solid var(--border);
    padding: 8px 8px 14px;
  }

  .home-panel .compact-primary {
    width: 100%;
  }

  .save-panel {
    grid-column: auto;
    grid-row: auto;
    grid-template-columns: 1fr;
    grid-template-areas:
      "capture"
      "line"
      "message"
      "action";
  }

  .save-dialog {
    width: 100%;
    max-height: calc(100dvh - max(20px, env(safe-area-inset-top)) - max(22px, env(safe-area-inset-bottom)));
    border-radius: 14px;
    padding: 10px;
  }

  .save-dialog-header {
    display: grid;
    gap: 8px;
    padding-bottom: 10px;
  }

  .review-panel,
  .history-panel {
    grid-column: auto;
    grid-row: auto;
  }

  .capture-card,
  .default-card,
  .line-panel,
  .entry-row {
    border-radius: 14px;
    padding: 9px;
  }

  .capture-card,
  .default-card,
  .line-panel {
    border: 0;
    background: transparent;
    padding: 0;
  }

  .capture-card {
    padding-bottom: 8px;
  }

  .line-panel {
    min-height: 0;
    border-left: 0;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .capture-layout,
  .save-panel {
    gap: 8px;
  }

  .capture-layout {
    grid-template-columns: 1fr;
  }

  .vehicle-input {
    min-height: 60px;
    border-radius: 14px;
    padding: 0 14px;
    font-size: 2.2rem;
  }

  .observation-option,
  .leg-option,
  .entry-leg-option,
  .entry-line-option,
  .entry-other-line-button,
  .secondary-button,
  .entry-actions button {
    min-height: 46px;
  }

  .location-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .location-warning {
    display: grid;
    gap: 8px;
  }

  .location-warning .secondary-button {
    width: 100%;
  }

  .leg-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .main-line-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .line-swatch {
    min-height: 48px;
    border-radius: 14px;
    font-size: 1.16rem;
  }

  .other-line-button {
    grid-column: 1 / -1;
    min-height: 44px;
    border-radius: 14px;
  }

  .other-line-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-height: 218px;
    border-radius: 14px;
    padding: 6px;
  }

  .other-line-chip {
    min-height: 50px;
    border-radius: 12px;
    padding: 6px;
  }

  .primary-button {
    min-height: 50px;
    border-radius: 16px;
  }

  .section-heading {
    align-items: flex-start;
    gap: 8px;
  }

  .section-heading.compact {
    display: grid;
    align-items: start;
  }

  .heading-actions {
    width: 100%;
    justify-content: stretch;
  }

  .heading-actions .secondary-button {
    width: 100%;
  }

  .review-header,
  .review-results {
    gap: 8px;
  }

  .review-header .secondary-button,
  .review-results .secondary-button {
    width: 100%;
  }

  .review-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-radius: 16px;
    padding: 8px;
  }

  .review-filters label:first-child {
    grid-column: 1 / -1;
  }

  .entry-main div {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  .entry-main strong {
    font-size: 1.34rem;
  }

  .entry-main p {
    max-width: none;
    text-align: left;
  }

  .entry-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-actions button:last-child {
    grid-column: 1 / -1;
  }

  .entry-actions button {
    width: 100%;
  }

  .entry-leg-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-line-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .entry-other-lines {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-height: 176px;
  }

  .entry-summary-grid,
  .coordinate-grid,
  .dialog-actions,
  .edit-inline-actions {
    grid-template-columns: 1fr;
  }

  .modal-backdrop {
    place-items: start center;
    padding: max(10px, env(safe-area-inset-top)) 10px max(18px, env(safe-area-inset-bottom));
  }

  .edit-dialog {
    width: 100%;
    max-height: calc(100dvh - max(20px, env(safe-area-inset-top)) - max(22px, env(safe-area-inset-bottom)));
    border-radius: 14px;
    padding: 10px;
  }

  .edit-dialog-header {
    top: -10px;
    margin: -10px -10px 0;
    padding: 10px;
  }

  .edit-dialog-header h2 {
    font-size: 1rem;
  }

  .edit-dialog-header .secondary-button {
    min-height: 36px;
    padding: 0 12px;
  }

  .edit-section-heading {
    display: grid;
  }

  .map-dialog-header {
    display: grid;
  }

  .danger-zone {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .danger-confirm-actions {
    grid-template-columns: 1fr;
  }

  .danger-button,
  .danger-confirm-actions .secondary-button {
    width: 100%;
  }

  .map-dialog {
    width: 100%;
    max-height: 94vh;
    padding: 12px;
  }

  .review-map {
    min-height: 300px;
    height: 50vh;
  }

  .mapcn-map {
    min-height: 300px;
    height: 50vh;
  }

  .result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 380px) {
  .main-line-grid,
  .leg-grid,
  .observation-grid,
  .review-filters,
  .entry-actions,
  .entry-leg-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-line-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .entry-other-line-button {
    grid-column: 1 / -1;
  }

  .other-line-list,
  .entry-other-lines {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@keyframes mapcn-pulse {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;
