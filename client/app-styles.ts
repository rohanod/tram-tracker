export const APP_CSS = `
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · theme: Tracker Paper · enrichment: none · designed-as-app */
/* Hallmark · pre-emit critique: P4 H4 E5 S5 R5 V4 */
* { box-sizing: border-box; }
html { overflow-x: clip; background: var(--color-surface); }
body { margin: 0; min-width: 320px; overflow-x: clip; color: var(--color-text); background: var(--color-surface); font-family: var(--font-sans); }
button, input, select, textarea { font: inherit; }
button, select { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .48; }
:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

.tracker-page { min-height: 100dvh; background: var(--color-surface); }
.tracker-shell { width: 100%; height: 100dvh; min-height: 640px; padding: 24px 44px 20px; display: flex; flex-direction: column; }
.tracker-shell > * { min-width: 0; }
.app-header { min-height: 50px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.brand-block { min-width: 0; }
.brand-block strong { display: block; font-size: 20px; line-height: 1.15; letter-spacing: -.015em; }
.status-line { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 2px; color: var(--color-text-secondary); font-size: 12px; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.button, .icon-button { min-height: 44px; border: 1px solid var(--tracker-border); background: var(--color-surface); color: var(--color-text); font-weight: 600; transition: transform var(--transition-duration-fast) var(--cubic-move), opacity var(--transition-duration-fast) var(--cubic-move); }
.button { padding: 0 18px; border-radius: var(--tracker-radius-control); white-space: nowrap; }
.icon-button { width: 44px; padding: 0; border-radius: var(--tracker-radius-control); display: inline-grid; place-items: center; }
.button:active:not(:disabled), .icon-button:active:not(:disabled) { transform: translateY(1px); }
.button.primary { color: var(--color-text-inverse); background: var(--tracker-ink); border-color: var(--tracker-ink); }
.button.danger { color: var(--color-text-inverse); background: var(--color-background-danger-solid); border-color: var(--color-background-danger-solid); }
.button.danger-outline { color: var(--color-text-danger); border-color: var(--red-100); }
.button.compact { min-height: 40px; padding: 0 14px; font-size: 13px; }
.settings-button { gap: 8px; font-size: 13px; }
.settings-button svg { display: none; }
.save-new { min-width: 112px; font-size: 13px; }

.search-section { margin-top: 12px; }
.search-copy h1 { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 36px; line-height: 1.08; letter-spacing: -.025em; }
.search-copy p { margin: 3px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.mobile-title { display: none; }
.search-and-stats { margin-top: 10px; display: grid; grid-template-columns: minmax(360px, 1fr) 144px 144px; gap: 12px; }
.search-field { min-width: 0; height: 48px; padding: 0 12px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); outline: 2px solid transparent; outline-offset: 1px; display: flex; align-items: center; gap: 10px; color: var(--color-text-secondary); background: var(--color-surface); }
.search-field:focus-within { outline-color: var(--color-ring); }
.search-field svg { width: 18px; height: 18px; flex: 0 0 auto; }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font-size: 16px; }
.search-field input::placeholder { color: var(--color-text-tertiary); }
.search-field kbd { width: 26px; height: 26px; flex: 0 0 auto; border: 1px solid var(--tracker-border); border-radius: var(--radius-md); display: grid; place-items: center; color: var(--color-text-secondary); background: var(--tracker-paper); font: 500 12px/1 var(--font-sans); }
.stat-tile { min-width: 0; height: 48px; padding: 6px 10px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); background: var(--tracker-paper); display: flex; flex-direction: column; justify-content: center; font-variant-numeric: tabular-nums; }
.stat-tile > span { color: var(--color-text-secondary); font-size: 10px; line-height: 1; }
.stat-tile > div { min-width: 0; display: flex; align-items: baseline; gap: 6px; }
.stat-tile strong { overflow: hidden; text-overflow: ellipsis; font-size: 18px; line-height: 1.25; }
.stat-tile small { color: var(--color-text-secondary); font-size: 10px; white-space: nowrap; }

.filter-row { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
.desktop-filters { width: 100%; }
.desktop-filters .select-control-wrap, .desktop-filters .date-control-wrap { width: auto; min-width: 0; }
.filter-control { position: relative; width: auto; min-width: 132px; height: 40px; padding: 0 11px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); outline: 2px solid transparent; outline-offset: 1px; background: var(--color-surface); color: var(--color-text); display: flex; align-items: center; gap: 4px; text-align: left; }
.filter-control:focus-within { outline-color: var(--color-ring); }
.control-label { color: var(--color-text); font-size: 12px; line-height: 1; font-weight: 600; white-space: nowrap; }
.desktop-filters .control-label::after { content: ":"; }
.control-value { min-width: 0; flex: 1; display: flex; align-items: center; gap: 5px; color: var(--color-text); font-size: 12px; line-height: 1.25; font-weight: 500; }
.control-value > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.select-control-wrap, .date-control-wrap { min-width: 0; }
.select-control, .date-control { width: 100%; cursor: pointer; }
.select-control .control-value { width: 100%; }
.select-control .control-value > svg { margin-left: auto; color: var(--color-text-secondary); flex: 0 0 auto; transition: transform var(--transition-duration-fast) var(--cubic-move); }
.select-control.open .control-value > svg { transform: rotate(180deg); }
.date-range-control { min-width: 160px; }
.date-control .control-value { justify-content: space-between; }
.date-control .control-value svg { color: var(--color-text-secondary); flex: 0 0 auto; }
.desktop-filters .line-pill { min-width: 28px; height: 22px; padding: 0 7px; font-size: 11px; }
.result-count { margin-left: auto; color: var(--color-text-secondary); font-size: 12px; white-space: nowrap; }
.mobile-filters { display: none; }
.select-menu { position: fixed; z-index: var(--z-tooltip); padding: 6px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); background: var(--color-surface); box-shadow: var(--shadow-300); overflow-y: auto; }
.select-option { width: 100%; min-height: 40px; padding: 5px 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text); display: flex; align-items: center; gap: 9px; text-align: left; }
.select-option[aria-selected="true"] { background: var(--tracker-paper); font-weight: 650; }
.select-option .line-pill { flex: 0 0 auto; }

.offline-banner { margin-top: 10px; padding: 8px 12px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); color: var(--color-text-secondary); background: var(--tracker-paper); font-size: 12px; font-weight: 600; }
.results-panel { flex: 1; min-height: 0; margin-top: 10px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); display: flex; flex-direction: column; overflow: hidden; }
.table-wrap { flex: 1; min-height: 0; padding: 14px 16px 0; overflow: auto; }
.table-heading { display: flex; align-items: center; justify-content: space-between; margin: 0 18px 7px; }
.table-heading h2 { margin: 0; font-size: 16px; }
.table-heading span { color: var(--color-text-secondary); font-size: 11px; }
.vehicle-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.vehicle-table th { height: 34px; padding: 0 18px; border-bottom: 1px solid var(--tracker-rule); color: var(--color-text-secondary); font-size: 10px; font-weight: 650; text-align: left; }
.vehicle-table td { height: 52px; padding: 0 18px; border-top: 1px solid var(--tracker-rule); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.vehicle-table tbody tr:first-child td { border-top: 0; }
.vehicle-table th:nth-child(1) { width: 21%; }
.vehicle-table th:nth-child(2) { width: 10%; }
.vehicle-table th:nth-child(3) { width: 45%; }
.vehicle-table th:nth-child(4) { width: 24%; }
.vehicle-cell { min-width: 0; display: flex; align-items: center; gap: 8px; }
.open-entry { min-width: 0; min-height: 36px; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 700; text-align: left; }
.note-mark { flex: 0 0 auto; padding: 3px 7px; border: 1px solid var(--tracker-border); border-radius: var(--radius-full); color: var(--color-text-secondary); background: var(--tracker-paper); font-size: 9px; line-height: 1; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.journey-cell { min-width: 0; display: grid; gap: 2px; }
.journey-cell strong, .journey-cell small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.journey-cell strong { font-size: 12px; font-weight: 600; }
.journey-cell small, .muted-cell { color: var(--color-text-secondary); font-size: 11px; }
.line-pill { min-width: 32px; height: 24px; padding: 0 8px; border-radius: var(--radius-full); display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; }
.mobile-card-list, .mobile-pagination { display: none; }
.desktop-pagination { margin-top: auto; padding: 10px 16px 12px; display: flex; justify-content: center; }
.pagination { padding: 6px 14px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); background: var(--color-surface); display: flex; align-items: center; justify-content: center; gap: 7px; }
.pagination button { min-width: 30px; height: 30px; padding: 0 7px; border: 1px solid var(--tracker-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font-size: 11px; font-weight: 600; }
.pagination button.active { color: var(--color-text-inverse); background: var(--tracker-ink); border-color: var(--tracker-ink); }
.pagination .page-wide { min-width: 48px; }
.pagination span { min-width: 16px; font-size: 12px; text-align: center; }

.system-state { min-height: 210px; margin: auto; padding: 24px 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.system-state h2 { margin: 0; font-size: 22px; }
.system-state p { max-width: 34ch; margin: 7px 0 16px; color: var(--color-text-secondary); font-size: 14px; }
.loading-rows { padding: 20px; display: grid; gap: 10px; }
.loading-rows span { height: 52px; border-radius: var(--tracker-radius-control); background: var(--tracker-paper); animation: skeleton-pulse 1.1s var(--cubic-move) infinite; }

.modal-backdrop { position: fixed; inset: 0; z-index: var(--z-modal-backdrop); padding: 24px; display: grid; place-items: center; background: color-mix(in srgb, var(--black) 34%, transparent); }
.modal { width: min(100%, 760px); max-height: calc(100dvh - 48px); background: var(--color-surface); border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-modal); box-shadow: var(--shadow-300); display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 24px 24px 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.modal-header h2 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: -.02em; }
.modal-header p { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 14px; }
.close-button { flex: 0 0 auto; }
.modal-body { min-height: 0; padding: 2px 24px 22px; overflow: auto; }
.modal-footer { padding: 14px 24px 24px; border-top: 1px solid var(--tracker-rule); display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--color-surface); }
.modal-footer .button { width: 100%; }
.entry-form { display: grid; gap: 16px; }
.field { display: grid; gap: 6px; color: var(--color-text-secondary); font-weight: 600; }
.field input, .field select, .vehicle-note-editor textarea { width: 100%; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); outline: 2px solid transparent; outline-offset: 1px; background: var(--color-surface); color: var(--color-text); font-weight: 400; }
.field input, .field select { height: 48px; padding: 0 14px; }
.field input:focus, .field select:focus, .vehicle-note-editor textarea:focus { outline-color: var(--color-ring); }
.field input::placeholder, .vehicle-note-editor textarea::placeholder { color: var(--color-text-tertiary); }
.choice-field { min-width: 0; padding: 0; margin: 0; border: 0; }
.choice-field legend { margin-bottom: 7px; color: var(--color-text-secondary); font-weight: 600; }
.choice-row { display: flex; flex-wrap: wrap; gap: 8px; }
.line-choice-row { display: grid; gap: 8px; }
.default-line-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 8px; }
.default-line-choices .line-choice, .line-choice-row .other-choice { width: 100%; }
.choice-row.two-up .choice-pill { flex: 1; }
.choice-pill, .line-choice { min-height: 44px; padding: 0 16px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); background: var(--color-surface); color: var(--color-text-secondary); font-weight: 650; }
.choice-pill.selected { color: var(--color-text-inverse); background: var(--tracker-ink); border-color: var(--tracker-ink); }
.line-choice { min-width: 70px; }
.other-choice { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.direction-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.direction-row .choice-pill { width: 100%; min-width: 0; }
.direction-row .other-choice { grid-column: 1 / -1; }
.location-row { display: grid; grid-template-columns: minmax(0, 1fr) 48px; gap: 8px; }
.location-button { width: 48px; height: 48px; padding: 0; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-control); background: var(--color-surface); display: grid; place-items: center; }
.location-status { min-height: 1lh; color: var(--color-text-secondary); font-size: 12px; font-weight: 400; }
.form-error { margin: 0; color: var(--color-text-danger); font-weight: 600; }

.details-map { height: 250px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); overflow: hidden; }
.details-map > .mapcn-shell, .mapcn-map { width: 100%; height: 100%; }
.mapcn-shell, .mapcn-map { position: relative; overflow: hidden; background: var(--color-surface-secondary); }
.mapcn-map.editable { cursor: crosshair; touch-action: none; }
.mapcn-loader { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; gap: 5px; background: color-mix(in srgb, var(--color-surface) 58%, transparent); backdrop-filter: blur(3px); }
.mapcn-loader span { width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-secondary); animation: mapcn-pulse 900ms var(--cubic-move) infinite; }
.mapcn-loader span:nth-child(2) { animation-delay: 140ms; }
.mapcn-loader span:nth-child(3) { animation-delay: 280ms; }
.mapcn-error { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; color: var(--color-text-secondary); background: var(--color-surface-secondary); font-size: 14px; font-weight: 600; }
.mapcn-controls { position: absolute; right: 10px; bottom: 36px; z-index: 5; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--tracker-border); border-radius: var(--radius-md); background: var(--color-surface); }
.mapcn-controls button { width: 36px; height: 36px; padding: 0; border: 0; border-bottom: 1px solid var(--tracker-rule); display: grid; place-items: center; background: transparent; color: var(--color-text); }
.mapcn-controls button:last-child { border-bottom: 0; }
.mapcn-controls svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
.mapcn-range-label { position: absolute; left: 10px; bottom: 10px; z-index: 5; padding: 5px 9px; border: 1px solid var(--tracker-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-secondary); font-size: 12px; font-weight: 650; }
.details-grid { margin: 10px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); overflow: hidden; }
.details-grid div { min-width: 0; padding: 10px 12px; border-inline-end: 1px solid var(--tracker-rule); border-block-end: 1px solid var(--tracker-rule); }
.details-grid div:nth-child(2n) { border-inline-end: 0; }
.details-grid div:nth-last-child(-n + 2) { border-block-end: 0; }
.details-grid dt { color: var(--color-text-secondary); font-size: 12px; }
.details-grid dd { margin: 3px 0 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.3; }
.vehicle-note-editor { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--tracker-rule); }
.vehicle-note-editor .field { margin-bottom: 6px; }
.vehicle-note-editor textarea { min-height: 96px; padding: 11px 13px; resize: vertical; line-height: 1.5; }
.vehicle-note-actions { min-height: 40px; margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.vehicle-note-actions small { color: var(--color-text-secondary); font-size: 12px; }
.vehicle-note-message { min-height: 1lh; margin: 4px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.vehicle-note-message.error { color: var(--color-text-danger); font-weight: 600; }

.line-picker-modal { width: min(100%, 600px); max-height: min(620px, calc(100dvh - 96px)); }
.line-picker-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.line-picker-grid .line-choice { width: 100%; min-width: 0; }
.settings-section-title { margin: 0 0 10px; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 16px; }
.settings-section-title span { color: var(--color-text-secondary); font-size: 12px; font-weight: 500; }
.default-line-list { display: grid; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); overflow: hidden; }
.default-line-row { position: relative; min-height: 58px; padding: 6px; border-bottom: 1px solid var(--tracker-rule); display: grid; grid-template-columns: 40px 80px 1fr 44px; align-items: center; gap: 8px; transition: transform var(--transition-duration-fast) var(--cubic-move), opacity var(--transition-duration-fast) var(--cubic-move); }
.default-line-row:last-child { border-bottom: 0; }
.default-line-row.dragging { z-index: var(--z-modal); background: var(--color-surface); box-shadow: var(--shadow-300); }
.drag-handle { width: 40px; height: 44px; padding: 0; border: 0; border-radius: var(--radius-md); display: grid; place-items: center; color: var(--color-text-secondary); background: transparent; cursor: grab; touch-action: none; }
.drag-handle:active { cursor: grabbing; }
.remove-line svg { width: 20px; height: 20px; }
.add-line { width: 100%; margin-top: 10px; }
.settings-account { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--tracker-rule); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.settings-account p { margin: 3px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.settings-account-actions { display: flex; gap: 8px; }
.filter-dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.filter-dialog-grid .full { grid-column: 1 / -1; }
.filter-dialog-grid .filter-control, .filter-dialog-grid .full .filter-control { width: 100%; }

.date-picker-popover { position: fixed; z-index: var(--z-tooltip); padding: 12px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); background: var(--color-surface); box-shadow: var(--shadow-300); animation: popover-in var(--transition-duration-fast) var(--cubic-enter); }
.calendar-toolbar { margin-bottom: 8px; display: grid; grid-template-columns: 32px 1fr 32px; align-items: center; text-align: center; }
.calendar-toolbar strong { font-size: 14px; font-weight: 600; }
.calendar-toolbar .icon-button { width: 32px; min-height: 32px; border: 0; border-radius: var(--radius-md); }
.calendar-months { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.calendar-month { min-width: 0; }
.calendar-month-label { display: block; margin-bottom: 6px; font-size: 13px; text-align: center; }
.calendar-weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.calendar-weekdays { gap: 4px; margin-bottom: 4px; }
.calendar-weekdays span { padding: 5px 0; color: var(--color-text-tertiary); font-size: 11px; font-weight: 500; text-align: center; }
.calendar-grid button { min-width: 0; aspect-ratio: 1; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text); font-size: 13px; }
.calendar-grid button.outside { color: var(--color-text-tertiary); }
.calendar-grid button.today, .calendar-grid button.range-middle { background: var(--tracker-paper); }
.calendar-grid button.range-middle { border-radius: 0; }
.calendar-grid button.range-start, .calendar-grid button.range-end { color: var(--color-text-inverse); background: var(--tracker-ink); font-weight: 700; }
.calendar-grid button.range-start { border-radius: var(--radius-md) 0 0 var(--radius-md); }
.calendar-grid button.range-end { border-radius: 0 var(--radius-md) var(--radius-md) 0; }
.calendar-grid button.range-start.range-end { border-radius: var(--radius-md); }
.calendar-grid button:disabled { color: var(--gray-250); }
.calendar-actions { margin: 10px -12px -12px; padding: 8px 10px; border-top: 1px solid var(--tracker-rule); display: flex; align-items: center; gap: 4px; }
.calendar-actions button { min-height: 36px; padding: 0 10px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text-secondary); font-size: 13px; font-weight: 600; }
.calendar-actions .calendar-confirm { min-width: 84px; margin-left: auto; color: var(--color-text-inverse); background: var(--tracker-ink); }
.confirm-modal { width: min(100%, 520px); }
.confirm-modal .modal-body { display: none; }
.confirm-modal .button.danger { background: var(--color-background-danger-solid); border-color: var(--color-background-danger-solid); }

.toast { position: fixed; z-index: var(--z-toast); top: 18px; left: 50%; width: min(calc(100% - 32px), 520px); min-height: 50px; padding: 8px 8px 8px 16px; transform: translateX(-50%); border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); background: var(--color-surface); box-shadow: var(--shadow-200); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toast .icon-button { min-height: 36px; width: 36px; border: 0; }
.inline-alert { padding: 10px 12px; border: 1px solid var(--red-100); border-radius: var(--tracker-radius-control); background: var(--red-25); color: var(--red-700); display: flex; justify-content: space-between; }
.inline-alert button { border: 0; background: transparent; color: inherit; font-weight: 700; }

.auth-page { min-height: 100dvh; padding: 24px; background: var(--tracker-paper); display: grid; place-items: center; }
.auth-panel { width: min(100%, 560px); padding: 34px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-modal); background: var(--color-surface); }
.auth-panel h1 { margin: 6px 0 12px; font-size: 34px; letter-spacing: -.025em; }
.auth-panel p { color: var(--color-text-secondary); }
.auth-panel .button { width: 100%; margin-top: 10px; }
.eyebrow { margin: 0; color: var(--color-text) !important; font-weight: 700; }

@media (hover: hover) and (pointer: fine) {
  .button:hover:not(:disabled), .icon-button:hover:not(:disabled), .filter-control:hover, .select-option:hover, .vehicle-table tbody tr:hover, .vehicle-card:hover, .pagination button:hover:not(:disabled), .calendar-grid button:hover:not(:disabled), .calendar-actions button:hover:not(:disabled), .drag-handle:hover { background: var(--tracker-row-hover); }
  .button.primary:hover:not(:disabled), .pagination button.active:hover:not(:disabled), .calendar-actions .calendar-confirm:hover:not(:disabled) { color: var(--color-text-inverse); background: var(--gray-750); border-color: var(--gray-750); }
  .button.danger:hover:not(:disabled) { background: var(--red-700); border-color: var(--red-700); }
  .button.danger-outline:hover:not(:disabled) { background: var(--red-25); border-color: var(--red-400); }
  .open-entry:hover { text-decoration: underline; text-underline-offset: 3px; }
}

@keyframes skeleton-pulse { 50% { opacity: .52; } }
@keyframes popover-in { from { opacity: 0; transform: translateY(-4px); } }
@keyframes mapcn-pulse { 50% { transform: translateY(-3px); opacity: .55; } }
@keyframes sheet-in { from { transform: translateY(14px); opacity: .7; } }

@media (max-width: 899px) {
  .tracker-shell { height: auto; min-height: 100dvh; padding: 20px max(20px, env(safe-area-inset-left)) calc(14px + env(safe-area-inset-bottom)); }
  .app-header { position: sticky; top: 0; z-index: var(--z-sticky); min-height: 50px; margin: -20px -20px 0; padding: calc(20px + env(safe-area-inset-top)) 20px 10px; gap: 8px; background: color-mix(in srgb, var(--color-surface) 95%, transparent); backdrop-filter: blur(10px); }
  .brand-block strong { font-size: 20px; }
  .status-line { margin-top: 1px; }
  .header-actions { flex: 0 0 auto; }
  .settings-button { width: 44px; min-width: 44px; padding: 0; }
  .settings-button svg { display: block; }
  .settings-button span { display: none; }
  .save-new { min-width: 104px; font-size: 14px; }
  .search-section { margin-top: 16px; }
  .desktop-title { display: none; }
  .mobile-title { display: inline; }
  .search-copy h1 { font-size: 34px; line-height: 1; }
  .search-copy p, .search-field kbd { display: none; }
  .search-and-stats { margin-top: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .search-field { grid-column: 1 / -1; height: 50px; padding: 0 14px; }
  .search-field svg { width: 20px; height: 20px; }
  .stat-tile { height: 44px; padding: 5px 9px; }
  .stat-tile > span { font-size: 9px; }
  .stat-tile strong { font-size: 16px; }
  .stat-tile small { font-size: 9px; }
  .desktop-filters, .table-wrap, .desktop-pagination { display: none; }
  .mobile-filters { width: 100%; min-width: 0; display: grid; grid-template-columns: minmax(96px, .86fr) minmax(132px, 1.14fr) auto; align-items: center; gap: 8px; margin-top: 10px; }
  .mobile-filters .button, .mobile-filters .select-control-wrap { min-width: 0; }
  .mobile-filters .button, .mobile-filters .select-control { min-height: 44px; height: 44px; padding: 0 11px; display: flex; align-items: center; }
  .mobile-filters .button { justify-content: space-between; gap: 8px; }
  .mobile-filters .select-control .control-value { width: 100%; font-size: 13px; }
  .mobile-filters .control-label { display: none; }
  .mobile-filters .result-count { align-self: center; font-size: 11px; }
  .results-panel { flex: 1; min-height: 0; margin-top: 12px; border: 0; border-radius: 0; overflow: visible; }
  .mobile-card-list { display: grid; gap: 8px; }
  .vehicle-card { width: 100%; min-height: 88px; padding: 12px 14px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); background: var(--color-surface); color: var(--color-text); text-align: left; display: grid; gap: 8px; }
  .card-top, .card-bottom { min-width: 0; display: flex; align-items: center; gap: 9px; }
  .card-top > strong { font-size: 22px; line-height: 1; }
  .card-top .line-pill { min-width: 44px; height: 30px; padding: 0 10px; font-size: 13px; }
  .card-top time { margin-left: auto; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .card-bottom b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
  .mobile-pagination { margin-top: auto; padding: 16px 0 4px; display: flex; justify-content: center; }
  .pagination { width: 100%; padding: 6px 10px; }
  .pagination button { min-width: 44px; height: 44px; }
  .pagination .page-wide { min-width: 54px; }
  .system-state { width: 100%; min-height: 210px; margin: 0; padding: 24px 18px; border: 1px solid var(--tracker-border); border-radius: var(--tracker-radius-panel); }
  .modal-backdrop { padding: 0; align-items: end; }
  .modal { width: 100%; max-height: calc(94dvh - env(safe-area-inset-top)); border-radius: var(--tracker-radius-modal) var(--tracker-radius-modal) 0 0; animation: sheet-in var(--transition-duration-basic) var(--cubic-enter); }
  .modal::before { content: ""; width: 48px; height: 4px; margin: 9px auto 0; border-radius: var(--radius-full); background: var(--tracker-border); flex: 0 0 auto; }
  .modal-header { padding: 16px 20px 13px; }
  .modal-header h2 { font-size: 25px; }
  .modal-body { padding: 2px 20px 18px; }
  .modal-footer { position: sticky; bottom: 0; padding: 12px 20px calc(16px + env(safe-area-inset-bottom)); gap: 10px; }
  .entry-form { gap: 14px; }
  .default-line-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .details-map { height: 220px; }
  .vehicle-note-actions { align-items: stretch; flex-direction: column; }
  .vehicle-note-actions .button { width: 100%; }
  .line-picker-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
  .line-picker-grid .line-choice { padding: 0 6px; }
  .default-line-row { grid-template-columns: 36px 64px 1fr 44px; gap: 6px; }
  .drag-handle { width: 36px; }
  .settings-account { align-items: stretch; flex-direction: column; }
  .settings-account-actions .button { flex: 1; }
  .filter-dialog-grid { grid-template-columns: 1fr; }
  .filter-dialog-grid .full, .filter-dialog-grid .date-range-control { grid-column: auto; }
  .calendar-months { grid-template-columns: 1fr; }
  .confirm-modal .modal-header { min-height: 210px; }
  .auth-page { padding: 16px; }
  .auth-panel { padding: 28px 22px; }
}

@media (max-width: 360px) {
  .tracker-shell { padding-left: 14px; padding-right: 14px; }
  .app-header { margin-left: -14px; margin-right: -14px; padding-left: 14px; padding-right: 14px; }
  .brand-block strong { font-size: 16px; white-space: nowrap; }
  .status-line { font-size: 10px; }
  .save-new { min-width: 92px; padding: 0 11px; }
  .mobile-filters { grid-template-columns: minmax(82px, .8fr) minmax(118px, 1.2fr) auto; gap: 6px; }
  .mobile-filters .button, .mobile-filters .select-control { padding-left: 8px; padding-right: 8px; font-size: 12px; }
  .stat-tile small { display: none; }
  .card-top { gap: 7px; }
  .note-mark { padding-inline: 5px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
`;
