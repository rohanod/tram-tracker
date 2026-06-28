import { SignInWithGoogle, signOut } from "lakebed/client";
import { useEffect } from "preact/hooks";
import type { LocationState, Viewer } from "./types";

export function AuthGate({
  authLoading,
  viewer,
  isOnline,
  priorAuthorized,
  cachedAccessAllowed
}: {
  authLoading: boolean;
  viewer?: Viewer;
  isOnline: boolean;
  priorAuthorized: boolean;
  cachedAccessAllowed: boolean;
}) {
  if (!isOnline && !priorAuthorized) {
    return (
      <section className="auth-panel">
        <h2>Sign in online first</h2>
        <p>This device needs one successful authorized Google sign-in before offline saving is available.</p>
      </section>
    );
  }

  if (authLoading && !viewer) {
    return (
      <section className="auth-panel">
        <h2>Checking access</h2>
        <p>Confirming the current session.</p>
        {cachedAccessAllowed ? (
          <div className="auth-panel-actions">
            <SignInWithGoogle className="primary-button auth-button" />
          </div>
        ) : null}
      </section>
    );
  }

  if (!viewer) {
    return (
      <section className="auth-panel">
        <h2>Checking access</h2>
        <p>Keeping the last allowed session active while access refreshes.</p>
        <div className="auth-panel-actions">
          <SignInWithGoogle className="primary-button auth-button" />
        </div>
      </section>
    );
  }

  if (!viewer.hasAllowedEmail) {
    return (
      <section className="auth-panel">
        <h2>Allowlist missing</h2>
        <p>Set ALLOWED_EMAIL in .env.lakebed.server, then restart Lakebed.</p>
      </section>
    );
  }

  if (viewer.isGuest) {
    return (
      <section className="auth-panel">
        <h2>Private saver</h2>
        <p>Sign in with the allowed Google account to save tram vehicles.</p>
        <div className="auth-panel-actions">
          <SignInWithGoogle className="primary-button auth-button" />
        </div>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <h2>Account not allowed</h2>
      <p>{viewer.email || "This Google account"} is not on the allowlist.</p>
      <div className="auth-panel-actions">
        <button className="secondary-button" type="button" onClick={() => signOut()}>
          Sign out
        </button>
        <SignInWithGoogle className="primary-button auth-button" />
      </div>
    </section>
  );
}

export function LocationPermissionWarning({ location, onRetry }: { location: LocationState; onRetry: () => void }) {
  if (location.status !== "denied" && location.status !== "unavailable") {
    return null;
  }

  const isDenied = location.status === "denied";
  return (
    <div className={isDenied ? "location-warning denied" : "location-warning"} role="alert" aria-live="polite">
      <div>
        <strong>{isDenied ? "Location permission is off" : "Location is unavailable"}</strong>
        <p>
          {isDenied
            ? "Route and leg defaults cannot be detected until location access is enabled for this site. You can still save manually."
            : "The app could not get your current position. Check signal or try again; manual saving still works."}
        </p>
      </div>
      <button className="secondary-button small-button" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss message" onClick={onClose}>
        x
      </button>
    </div>
  );
}

export function ConfirmDeleteDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop confirm-backdrop" role="presentation" onClick={onCancel}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-body" onClick={(event) => event.stopPropagation()}>
        <div>
          <h2 id="confirm-delete-title">{title}</h2>
          <p className="subtle" id="confirm-delete-body">
            {body}
          </p>
        </div>
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-button solid" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function PageTabs({ appPage, className = "", disabled = false, onNavigate }: { appPage: string; className?: string; disabled?: boolean; onNavigate: (page: string) => void }) {
  const tabs = [
    { page: "saver", label: "Save", glyph: "+" },
    { page: "saves", label: "Search", glyph: "?" }
  ];

  return (
    <nav className={"app-tabs " + className} aria-label="Primary">
      {tabs.map((tab) => (
        <button className={appPage === tab.page ? "app-tab active" : "app-tab"} key={tab.page} type="button" aria-current={appPage === tab.page ? "page" : undefined} disabled={disabled} onClick={() => onNavigate(tab.page)}>
          <span className="tab-glyph" aria-hidden="true">{tab.glyph}</span>
          <span>{tab.label}{tab.badge ? " " + tab.badge : ""}</span>
        </button>
      ))}
    </nav>
  );
}
