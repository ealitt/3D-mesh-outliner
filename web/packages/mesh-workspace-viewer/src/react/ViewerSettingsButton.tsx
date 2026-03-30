import { useEffect, useRef, useState } from "preact/hooks";
import { normalizeViewerSettings } from "../core/defaults";
import type { ViewerSettingsButtonProps } from "../core/types";

const DEFAULT_COPY = {
  alignmentLabel: "Transform alignment",
  buildPlateCopy: "Keep the print bed visible in perspective view.",
  buildPlateLabel: "Build plate",
  objectOption: "Object",
  transformAlignmentLabel: "Transform alignment",
  worldOption: "World",
};

export function ViewerSettingsButton(props: ViewerSettingsButtonProps) {
  const settings = normalizeViewerSettings(props.settings);
  const copy = {
    ...DEFAULT_COPY,
    ...(props.copy ?? {}),
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function commit(nextValue: Partial<typeof settings>) {
    props.onSettingsChange?.({
      ...settings,
      ...nextValue,
    });
  }

  return (
    <div className={`mwv-settings-shell ${props.className ?? ""}`.trim()} ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-label={props.buttonAriaLabel ?? "Open viewer settings"}
        className={`mwv-settings-button ${props.buttonClassName ?? ""}`.trim()}
        onClick={() => setIsOpen((current) => !current)}
        title={props.buttonTitle ?? "Viewer settings"}
        type="button"
      >
        <CogIcon />
      </button>

      {isOpen ? (
        <div className="mwv-settings-popover">
          <div className="mwv-settings-popover-head">
            <div>
              <p className="mwv-settings-kicker">{props.popoverKicker ?? "Viewer"}</p>
              <h2 className="mwv-settings-title">{props.popoverTitle ?? "Settings"}</h2>
            </div>
          </div>

          <div className="mwv-settings-grid">
            <label className="mwv-field">
              <span className="mwv-field-label">{copy.transformAlignmentLabel}</span>
              <select
                aria-label={copy.alignmentLabel}
                className="mwv-field-input"
                onChange={(event) =>
                  commit({
                    alignmentSpace: (event.currentTarget as HTMLSelectElement).value === "world" ? "world" : "local",
                  })}
                value={settings.alignmentSpace}
              >
                <option value="local">{copy.objectOption}</option>
                <option value="world">{copy.worldOption}</option>
              </select>
            </label>

            {props.showBuildPlateControl ? (
              <label className="mwv-toggle-card">
                <input
                  checked={settings.showBuildPlate}
                  onChange={(event) =>
                    commit({
                      showBuildPlate: (event.currentTarget as HTMLInputElement).checked,
                    })}
                  type="checkbox"
                />
                <div>
                  <span className="mwv-toggle-label">{copy.buildPlateLabel}</span>
                  <span className="mwv-toggle-copy">{copy.buildPlateCopy}</span>
                </div>
              </label>
            ) : null}

            {props.children}
          </div>

          {props.note ? <p className="mwv-settings-note">{props.note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function CogIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mwv-inline-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.53 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.53-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.16.07.33.1.51.1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
    </svg>
  );
}
