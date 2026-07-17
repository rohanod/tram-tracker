export const APP_CSS = `
/* Hallmark · pre-emit critique: P4 H4 E5 S5 R5 V3 */
* { box-sizing: border-box; }
html { overflow-x: clip; background: var(--color-surface); }
body { margin: 0; min-width: 320px; overflow-x: clip; color: var(--color-text); background: var(--color-surface); font-family: var(--font-sans); }
button, input, select { font: inherit; }
button, select { cursor: pointer; }
button:disabled { cursor: default; opacity: .42; }
:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-ring) 28%, transparent); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

.tracker-page { min-height: 100dvh; padding: 16px; background: var(--color-surface-secondary); }
.tracker-shell { width: min(100%, 1240px); height: calc(100dvh - 32px); min-height: 620px; margin: auto; padding: 28px 32px 24px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 20px; display: flex; flex-direction: column; }
.app-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.brand-block strong { display: block; font-size: 24px; line-height: 1.2; }
.status-line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 7px; color: var(--color-text-secondary); font-size: 14px; }
.status-sign-out { margin-left: 4px; padding: 0; color: inherit; background: none; border: 0; text-decoration: underline; text-underline-offset: 3px; }
.status-sync { padding: 0; border: 0; background: none; color: var(--color-text); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.status-sync:disabled { opacity: 1; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gray-450); }
.status-dot.online { background: var(--green-500); }
.header-actions { display: flex; align-items: center; gap: 10px; }
.button, .icon-button { min-height: 44px; border: 1px solid var(--gray-200); background: var(--color-surface); color: var(--color-text); font-weight: 600; transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease; }
.button { padding: 0 20px; border-radius: 14px; }
.button:hover:where(:not(:disabled)), .icon-button:hover:where(:not(:disabled)) { background: var(--gray-75); border-color: var(--gray-250); }
.button:active:not(:disabled), .icon-button:active:not(:disabled) { transform: translateY(1px) scale(.99); }
.button.primary { color: var(--color-text-inverse); background: var(--gray-1000); border-color: var(--gray-1000); }
.button.primary:hover:not(:disabled) { background: var(--gray-750); }
.button.danger { color: var(--color-text-inverse); background: var(--color-background-danger-solid); border-color: var(--color-background-danger-solid); }
.button.danger-outline { color: var(--color-text-danger); border-color: var(--red-100); }
.button.danger:hover:where(:not(:disabled)) { background: var(--red-700); border-color: var(--red-700); }
.button.danger-outline:hover:where(:not(:disabled)) { background: var(--red-25); border-color: var(--red-400); }
.button.compact { min-height: 36px; padding: 0 16px; border-radius: 12px; font-size: 14px; }
.icon-button { width: 44px; padding: 0; border-radius: 14px; display: inline-grid; place-items: center; }
.save-new { min-width: 120px; }

.search-section { margin-top: 28px; }
.search-copy h1 { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 36px; line-height: 1.08; letter-spacing: 0; }
.search-copy p { margin: 6px 0 0; color: var(--color-text-secondary); }
.search-and-stats { margin-top: 16px; }
.search-field { height: 50px; padding: 0 15px; border: 1.5px solid var(--gray-800); border-radius: 13px; display: flex; align-items: center; gap: 11px; color: var(--color-text-secondary); }
.search-field:focus-within { box-shadow: 0 0 0 3px var(--alpha-08); }
.search-field input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--color-text); font-size: 16px; }
.filter-row { display: flex; align-items: flex-end; gap: 8px; margin-top: 12px; }
.desktop-filters { width: 100%; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.desktop-filters .select-control-wrap, .desktop-filters .filter-control { width: 100%; min-width: 0; }
.filter-control { position: relative; min-width: 146px; height: 48px; padding: 7px 12px 6px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); color: var(--color-text); display: grid; gap: 1px; text-align: left; transition: border-color 150ms ease, background 150ms ease; }
.filter-control:hover { border-color: var(--color-border-strong); background: var(--color-surface-secondary); }
.filter-control:focus-within { border-color: var(--gray-700); box-shadow: 0 0 0 3px var(--alpha-06); }
.control-label { color: var(--color-text-secondary); font-size: 10px; line-height: 1; font-weight: 650; text-transform: uppercase; }
.control-value { min-width: 0; display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 14px; line-height: 1.25; font-weight: 600; }
.control-value > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.select-control-wrap { min-width: 0; }
.select-control { width: 100%; cursor: pointer; }
.select-control .control-value { width: 100%; }
.select-control .control-value > svg { margin-left: auto; color: var(--color-text-secondary); flex: 0 0 auto; transition: transform 150ms ease; }
.select-control.open .control-value > svg { transform: rotate(180deg); }
.select-menu { position: fixed; z-index: var(--z-tooltip); padding: 6px; border: 1px solid var(--color-border-strong); border-radius: 12px; background: var(--color-surface); box-shadow: var(--shadow-300); overflow-y: auto; }
.select-option { width: 100%; min-height: 40px; padding: 5px 8px; border: 0; border-radius: 9px; background: transparent; color: var(--color-text); display: flex; align-items: center; gap: 9px; text-align: left; }
.select-option:hover, .select-option:focus-visible, .select-option[aria-selected="true"] { background: var(--gray-75); }
.select-option[aria-selected="true"] { font-weight: 650; }
.select-option .line-pill { flex: 0 0 auto; }
.date-control-wrap { min-width: 0; }
.date-range-control { grid-column: span 2; }
.date-control { width: 100%; min-width: 0; cursor: pointer; }
.date-control .control-value { justify-content: space-between; }
.date-control .control-value svg { color: var(--color-text-secondary); flex: 0 0 auto; }
.mobile-filters { display: none; }
.result-count { margin-left: auto; color: var(--color-text-secondary); white-space: nowrap; }

.offline-banner { margin-top: 16px; padding: 10px 14px; border: 1px solid var(--gray-150); border-radius: 12px; color: var(--color-text-secondary); background: var(--gray-75); font-weight: 600; text-align: left; }
.results-panel { flex: 1; min-height: 0; margin-top: 16px; border: 1px solid var(--color-border); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; }
.table-wrap { flex: 1; min-height: 0; padding: 24px 28px 8px; overflow: auto; }
.table-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
.table-heading h2 { margin: 0; font-size: 20px; }
.table-heading span { color: var(--color-text-secondary); font-size: 14px; }
.vehicle-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.vehicle-table th { height: 40px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; text-align: left; }
.vehicle-table thead { background: var(--color-surface); }
.vehicle-table td { height: 54px; border-top: 1px solid var(--gray-100); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vehicle-table th:nth-child(1) { width: 12%; }
.vehicle-table th:nth-child(2) { width: 10%; }
.vehicle-table th:nth-child(3) { width: 25%; }
.vehicle-table th:nth-child(4) { width: 25%; }
.vehicle-table th:nth-child(5) { width: 18%; }
.vehicle-table th:nth-child(6) { width: 10%; text-align: right; }
.vehicle-table td:last-child { text-align: right; }
.vehicle-table tbody tr { transition: background 150ms ease; }
.vehicle-table tbody tr:hover { background: var(--gray-50); }
.muted-cell { color: var(--color-text-secondary); }
.line-pill { min-width: 42px; height: 30px; padding: 0 11px; border-radius: 10px; display: inline-grid; place-items: center; font-size: 13px; font-weight: 700; }
.mobile-card-list, .mobile-pagination { display: none; }
.desktop-pagination { margin-top: auto; padding: 20px 24px 24px; display: flex; justify-content: center; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 8px; }
.pagination button { min-width: 38px; height: 38px; padding: 0 11px; border: 1px solid var(--gray-200); border-radius: 12px; background: var(--color-surface); color: var(--color-text); font-weight: 600; }
.pagination button.active { color: var(--color-text-inverse); background: var(--gray-1000); border-color: var(--gray-1000); }
.pagination span { min-width: 20px; text-align: center; }

.system-state { min-height: 240px; margin: auto; padding: 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.system-state h2 { margin: 0; font-size: 24px; }
.system-state p { margin: 8px 0 18px; color: var(--color-text-secondary); font-size: 15px; }
.loading-rows { padding: 26px; display: grid; gap: 14px; }
.loading-rows span { height: 54px; border-radius: 13px; background: linear-gradient(90deg, var(--gray-75) 25%, var(--gray-25) 45%, var(--gray-75) 65%); background-size: 240% 100%; animation: shimmer 1.2s linear infinite; }

.modal-backdrop { position: fixed; inset: 0; z-index: var(--z-modal-backdrop); padding: 24px; display: grid; place-items: center; background: color-mix(in srgb, var(--black) 34%, transparent); }
.modal { width: min(100%, 760px); max-height: calc(100dvh - 48px); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 20px; box-shadow: var(--shadow-300); display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 28px 28px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.modal-header h2 { margin: 0; font-size: 30px; line-height: 1.1; }
.modal-header p { margin: 7px 0 0; color: var(--color-text-secondary); }
.close-button { flex: 0 0 auto; }
.modal-body { min-height: 0; padding: 4px 28px 24px; overflow: auto; }
.modal-footer { padding: 18px 28px 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: var(--color-surface); }
.modal-footer .button { width: 100%; }
.entry-form { display: grid; gap: 18px; }
.field { display: grid; gap: 7px; color: var(--color-text-secondary); font-weight: 600; }
.field input, .field select { width: 100%; height: 50px; padding: 0 15px; border: 1px solid var(--gray-200); border-radius: 14px; outline: 0; background: var(--color-surface); color: var(--color-text); font-weight: 400; }
.field input:focus, .field select:focus { border-color: var(--gray-800); box-shadow: 0 0 0 3px var(--alpha-06); }
.choice-field { min-width: 0; padding: 0; margin: 0; border: 0; }
.choice-field legend { margin-bottom: 8px; color: var(--color-text-secondary); font-weight: 600; }
.choice-row { display: flex; flex-wrap: wrap; gap: 9px; }
.line-choice-row { display: grid; gap: 9px; }
.default-line-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 9px; }
.default-line-choices .line-choice, .line-choice-row .other-choice { width: 100%; }
.choice-row.two-up .choice-pill { flex: 1; }
.choice-pill, .line-choice { min-height: 44px; padding: 0 18px; border: 1px solid var(--color-border-strong); border-radius: 14px; background: var(--color-surface); color: var(--color-text-secondary); font-weight: 650; }
.choice-pill.selected { color: var(--color-text-inverse); background: var(--gray-1000); border-color: var(--gray-1000); }
.line-choice { min-width: 70px; }
.other-choice { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.direction-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.direction-row .choice-pill { width: 100%; min-width: 0; }
.direction-row .other-choice { grid-column: 1 / -1; }
.location-row { display: grid; grid-template-columns: minmax(0, 1fr) 50px; gap: 10px; }
.readonly-input { min-height: 50px; padding: 0 15px; border: 1px solid var(--gray-200); border-radius: 14px; display: flex; align-items: center; color: var(--color-text); background: var(--color-surface); font-weight: 400; }
.readonly-input > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.location-button { width: 50px; height: 50px; padding: 0; border: 1px solid var(--gray-400); border-radius: 13px; background: var(--color-surface); display: grid; place-items: center; }
.location-status { min-height: 14px; color: var(--color-text-secondary); font-size: 12px; font-weight: 400; }
.form-error { margin: 0; color: var(--color-text-danger); font-weight: 600; }

.details-map { height: 280px; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
.details-map > .mapcn-shell,
.mapcn-map { width: 100%; height: 100%; }
.mapcn-shell, .mapcn-map { position: relative; overflow: hidden; background: var(--color-surface-secondary); }
.mapcn-map.editable { cursor: crosshair; touch-action: none; }
.mapcn-loader { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; gap: 5px; background: color-mix(in srgb, var(--color-surface) 58%, transparent); backdrop-filter: blur(3px); }
.mapcn-loader span { width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-secondary); animation: mapcn-pulse 900ms ease-in-out infinite; }
.mapcn-loader span:nth-child(2) { animation-delay: 140ms; }
.mapcn-loader span:nth-child(3) { animation-delay: 280ms; }
.mapcn-error { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; color: var(--color-text-secondary); background: var(--color-surface-secondary); font-size: 14px; font-weight: 600; }
.mapcn-controls { position: absolute; right: 10px; bottom: 36px; z-index: 5; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface); }
.mapcn-controls button { width: 34px; height: 34px; padding: 0; border: 0; border-bottom: 1px solid var(--color-border); display: grid; place-items: center; background: transparent; color: var(--color-text); }
.mapcn-controls button:last-child { border-bottom: 0; }
.mapcn-controls svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
.mapcn-range-label { position: absolute; left: 10px; bottom: 10px; z-index: 5; padding: 5px 9px; border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface); color: var(--color-text-secondary); font-size: 12px; font-weight: 650; }
.details-grid { margin: 12px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.details-grid div { min-width: 0; padding: 10px 12px; border: 1px solid var(--gray-150); border-radius: 12px; }
.details-grid dt { color: var(--color-text-secondary); font-size: 12px; }
.details-grid dd { margin: 3px 0 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.3; }
.line-picker-modal { width: min(100%, 600px); max-height: min(620px, calc(100dvh - 96px)); }
.line-picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.line-picker-grid .line-choice { width: 100%; }
.default-line-list { display: grid; gap: 10px; }
.default-line-row { position: relative; min-height: 60px; padding: 7px; border: 1px solid var(--gray-150); border-radius: 15px; display: grid; grid-template-columns: 40px 80px 1fr 44px; align-items: center; gap: 10px; transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease; }
.default-line-row.dragging { z-index: var(--z-modal); background: var(--color-surface); box-shadow: var(--shadow-300); }
.drag-handle { width: 40px; height: 44px; padding: 0; border: 0; border-radius: 11px; display: grid; place-items: center; color: var(--color-text-secondary); background: transparent; cursor: grab; touch-action: none; }
.drag-handle:hover { color: var(--color-text); background: var(--gray-75); }
.drag-handle:active { cursor: grabbing; }
.remove-line svg { width: 20px; height: 20px; }
.add-line { width: 100%; margin-top: 12px; }
.filter-dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.filter-dialog-grid .full { grid-column: 1 / -1; }
.filter-dialog-grid .filter-control, .filter-dialog-grid .full .filter-control { width: 100%; }
.date-picker-popover { position: fixed; z-index: var(--z-tooltip); padding: 12px; border: 1px solid var(--color-border-strong); border-radius: 14px; background: var(--color-surface); box-shadow: var(--shadow-300); animation: popover-in 140ms ease-out; }
.calendar-toolbar { margin-bottom: 8px; display: grid; grid-template-columns: 32px 1fr 32px; align-items: center; text-align: center; }
.calendar-toolbar strong { font-size: 14px; font-weight: 600; }
.calendar-toolbar .icon-button { width: 32px; min-height: 32px; border: 0; border-radius: 9px; }
.calendar-months { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.calendar-month { min-width: 0; }
.calendar-month-label { display: block; margin-bottom: 6px; font-size: 13px; text-align: center; }
.calendar-weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.calendar-grid { gap: 0; }
.calendar-weekdays { margin-bottom: 4px; }
.calendar-weekdays span { padding: 5px 0; color: var(--color-text-tertiary); font-size: 11px; font-weight: 500; text-align: center; }
.calendar-grid button { min-width: 0; aspect-ratio: 1; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--color-text); font-size: 13px; }
.calendar-grid button:hover:where(:not(:disabled)) { background: var(--color-surface-tertiary); }
.calendar-grid button.outside { color: var(--color-text-tertiary); }
.calendar-grid button.today { background: var(--color-surface-tertiary); box-shadow: none; }
.calendar-grid button.range-middle { border-radius: 0; background: var(--color-surface-tertiary); }
.calendar-grid button.range-start, .calendar-grid button.range-end { color: var(--color-text-inverse); background: var(--gray-900); box-shadow: none; font-weight: 700; }
.calendar-grid button.range-start { border-radius: 9px 0 0 9px; }
.calendar-grid button.range-end { border-radius: 0 9px 9px 0; }
.calendar-grid button.range-start.range-end { border-radius: 9px; }
.calendar-grid button:disabled { color: var(--gray-250); }
.calendar-actions { margin: 10px -12px -12px; padding: 8px 10px; border-top: 1px solid var(--color-border); display: flex; align-items: center; gap: 4px; }
.calendar-actions button { min-height: 32px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: var(--color-text-secondary); font-size: 13px; font-weight: 600; }
.calendar-actions button:hover:where(:not(:disabled)) { color: var(--color-text); background: var(--color-surface-tertiary); }
.calendar-actions .calendar-confirm { min-width: 84px; margin-left: auto; color: var(--color-text-inverse); background: var(--gray-900); }
.calendar-actions .calendar-confirm:hover:not(:disabled) { color: var(--color-text-inverse); background: var(--gray-800); }
.calendar-actions button:disabled { opacity: .4; }
.confirm-modal { width: min(100%, 520px); }
.confirm-modal .modal-body { display: none; }
.confirm-modal .button.danger { background: var(--color-background-danger-solid); border-color: var(--color-background-danger-solid); }

.toast { position: fixed; z-index: var(--z-toast); top: 18px; left: 50%; width: min(calc(100% - 32px), 520px); min-height: 50px; padding: 8px 8px 8px 16px; transform: translateX(-50%); border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); box-shadow: var(--shadow-200); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toast .icon-button { min-height: 36px; width: 36px; border: 0; }
.inline-alert { padding: 10px 12px; border-radius: 12px; background: var(--red-25); color: var(--red-700); display: flex; justify-content: space-between; }
.inline-alert button { border: 0; background: transparent; color: inherit; font-weight: 700; }

.auth-page, .upload-page { min-height: 100dvh; padding: 24px; background: var(--gray-50); display: grid; place-items: center; }
.auth-panel, .upload-panel { width: min(100%, 560px); padding: 38px; border: 1px solid var(--gray-200); border-radius: 24px; background: var(--color-surface); }
.auth-panel h1, .upload-panel h1 { margin: 6px 0 12px; font-size: 36px; }
.auth-panel p, .upload-panel p { color: var(--color-text-secondary); }
.auth-panel .button { width: 100%; margin-top: 10px; }
.eyebrow { margin: 0; color: var(--color-text) !important; font-weight: 700; }
.back-link { color: var(--color-text-secondary); }
.current-data { padding: 12px; border-radius: 12px; background: var(--gray-75); }
.file-field { margin: 16px 0; display: grid; gap: 8px; font-weight: 650; }
.file-field input { padding: 12px; border: 1px solid var(--gray-200); border-radius: 12px; }
.upload-status { min-height: 24px; }

@keyframes shimmer { to { background-position: -140% 0; } }
@keyframes popover-in { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
@keyframes mapcn-pulse { 50% { transform: translateY(-3px); opacity: .55; } }

@media (max-width: 900px) {
  .tracker-shell { padding: 28px; }
  .desktop-filters { width: 100%; }
}

@media (max-width: 767px) {
  .tracker-page { padding: 0; background: var(--color-surface); }
  .tracker-shell { width: 100%; height: auto; min-height: 100dvh; padding: 18px 16px calc(20px + env(safe-area-inset-bottom)); border: 0; border-radius: 0; }
  .app-header { position: sticky; top: 0; z-index: var(--z-sticky); margin: -18px -16px 0; padding: calc(14px + env(safe-area-inset-top)) 16px 12px; background: color-mix(in srgb, var(--color-surface) 94%, transparent); backdrop-filter: blur(10px); }
  .brand-block strong { font-size: 18px; }
  .status-line { margin-top: 3px; gap: 5px; font-size: 12px; }
  .status-sign-out, .desktop-filters, .table-wrap, .desktop-pagination { display: none; }
  .header-actions { gap: 7px; }
  .header-actions .icon-button { width: 40px; min-height: 40px; border-radius: 12px; }
  .save-new { min-width: 100px; min-height: 40px; padding: 0 14px; border-radius: 12px; white-space: nowrap; }
  .search-section { margin-top: 22px; }
  .search-copy h1 { font-size: 31px; }
  .search-copy p { display: none; }
  .search-and-stats { display: block; margin-top: 12px; }
  .search-field { height: 48px; padding: 0 13px; border-radius: 12px; }
  .search-field input { font-size: 16px; }
  .mobile-filters { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr) auto; gap: 8px; margin-top: 10px; }
  .mobile-filters .button, .mobile-filters .select-control-wrap { min-width: 0; }
  .mobile-filters .button { min-height: 42px; padding: 0 12px; border-radius: 12px; }
  .mobile-filters .select-control { height: 42px; padding: 0 10px; display: flex; align-items: center; }
  .mobile-filters .select-control .control-value { width: 100%; }
  .mobile-filters .result-count { align-self: center; font-size: 12px; }
  .offline-banner { margin-top: 12px; }
  .results-panel { height: auto; min-height: 0; max-height: none; margin-top: 16px; border: 0; border-radius: 0; overflow: visible; }
  .mobile-card-list { display: grid; gap: 10px; }
  .vehicle-card { width: 100%; min-height: 108px; padding: 16px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text); text-align: left; display: grid; gap: 14px; }
  .vehicle-card:hover { background: var(--gray-25); }
  .card-top, .card-bottom { min-width: 0; display: flex; align-items: center; gap: 12px; }
  .card-top > strong { font-size: 26px; line-height: 1; }
  .card-top time { margin-left: auto; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-bottom b, .card-bottom span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-bottom b { font-size: 16px; }
  .card-bottom span { margin-left: auto; color: var(--color-text-secondary); text-align: right; }
  .mobile-pagination { margin-top: auto; padding: 24px 0 6px; display: flex; justify-content: center; }
  .pagination { gap: 6px; }
  .pagination button { min-width: 36px; height: 38px; padding: 0 9px; }
  .system-state { width: 100%; min-height: 176px; margin: 20px auto 0; padding: 24px 18px; border: 1px solid var(--color-border); border-radius: 16px; }
  .system-state h2 { font-size: 22px; }
  .system-state p { max-width: 32ch; font-size: 14px; }
  .modal-backdrop { padding: 0; align-items: end; }
  .modal { width: 100%; max-height: calc(94dvh - env(safe-area-inset-top)); border-radius: 18px 18px 0 0; animation: sheet-in 180ms ease-out; }
  .modal::before { content: ""; width: 52px; height: 5px; margin: 10px auto 0; border-radius: 99px; background: var(--gray-200); flex: 0 0 auto; }
  .modal-header { padding: 18px 20px 14px; }
  .modal-header h2 { font-size: 27px; }
  .modal-header p { font-size: 14px; }
  .modal-body { padding: 2px 20px 20px; }
  .modal-footer { position: sticky; bottom: 0; padding: 14px 20px calc(18px + env(safe-area-inset-bottom)); gap: 10px; border-top: 1px solid var(--gray-100); }
  .entry-form { gap: 15px; }
  .choice-pill, .line-choice { min-height: 42px; padding: 0 14px; border-radius: 14px; }
  .default-line-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .direction-row { display: grid; grid-template-columns: 1fr 1fr; }
  .direction-row .choice-pill { min-width: 0; }
  .direction-row .other-choice { grid-column: 1 / -1; width: 100%; }
  .details-map { height: 230px; }
  .details-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .line-picker-grid { grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .line-picker-grid .line-choice { min-width: 0; padding: 0 6px; }
  .default-line-row { grid-template-columns: 36px 64px 1fr 44px; gap: 6px; }
  .drag-handle { width: 36px; }
  .filter-dialog-grid { grid-template-columns: 1fr; }
  .filter-dialog-grid .full { grid-column: auto; }
  .filter-dialog-grid .date-range-control { grid-column: auto; }
  .calendar-months { grid-template-columns: 1fr; }
  .confirm-modal .modal-header { min-height: 230px; }
  .auth-page, .upload-page { padding: 16px; }
  .auth-panel, .upload-panel { padding: 28px 22px; border-radius: 20px; }
}

@keyframes sheet-in { from { transform: translateY(14px); opacity: .7; } }
@media (max-width: 360px) {
  .brand-block strong { font-size: 16px; }
  .status-line { gap: 3px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 1ms !important; transition-duration: 1ms !important; } }
`;
