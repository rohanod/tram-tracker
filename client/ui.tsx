import { SignInWithGoogle, signOut } from "lakebed/client";
import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { LocationState, Viewer } from "./types";

let modalId = 0;

export function AuthGate({ authLoading, viewer, isOnline, priorAuthorized }: { authLoading: boolean; viewer?: Viewer; isOnline: boolean; priorAuthorized: boolean }) {
  let title = "Checking access";
  let body = "Confirming the current session.";
  if (!authLoading && !isOnline && !priorAuthorized) {
    title = "Sign in online first";
    body = "This device needs one authorized Google sign-in before offline use.";
  } else if (!authLoading && viewer && !viewer.hasAllowedUserId) {
    title = "Allowlist missing";
    body = viewer.userId ? `Set ALLOWED_USER_ID to ${viewer.userId}, then redeploy.` : "Set ALLOWED_USER_ID, then redeploy.";
  } else if (!authLoading && (!viewer || viewer.isGuest)) {
    title = "Private tracker";
    body = "Sign in with the allowed Google account.";
  } else if (!authLoading && viewer && !viewer.isAllowed) {
    title = "Account not allowed";
    body = viewer.email || "This Google account is not on the allowlist.";
  }
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Vehicle Tracker</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {!authLoading && isOnline && viewer?.isGuest ? <SignInWithGoogle className="button primary" /> : null}
        {viewer && !viewer.isGuest ? <button className="button secondary" type="button" onClick={() => signOut()}>Sign out</button> : null}
      </section>
    </main>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, className = "" }: { title: string; subtitle?: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${++modalId}`).current;
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); returnFocus.current?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <div><h2 id={titleId}>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button className="icon-button close-button" type="button" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function ConfirmDeleteDialog({ vehicleNumber, onCancel, onConfirm }: { vehicleNumber: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Delete saved entry?" subtitle={`Vehicle ${vehicleNumber} will be permanently removed. This can’t be undone.`} onClose={onCancel} className="confirm-modal" footer={<><button className="button secondary" type="button" onClick={onCancel}>Cancel</button><button className="button danger" type="button" onClick={onConfirm}>Delete</button></>}>
      <span />
    </Modal>
  );
}

export function LocationPermissionWarning({ location, onRetry }: { location: LocationState; onRetry: () => void }) {
  if (location.status !== "denied" && location.status !== "unavailable") return null;
  return <div className="inline-alert" role="alert"><span>{location.status === "denied" ? "Location permission is off." : "Location unavailable."}</span><button type="button" onClick={onRetry}>Try again</button></div>;
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="status" aria-live="polite"><span>{message}</span><button className="icon-button" type="button" aria-label="Dismiss" onClick={onClose}><CloseIcon /></button></div>;
}

export function CloseIcon() {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
}

export function SettingsIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.6h.4A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.4A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.4v4h-.4A1.7 1.7 0 0 0 19.4 15Z"/></svg>;
}

export function SearchIcon() {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}
