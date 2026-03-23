import { useMemo, useState } from "preact/hooks";
import { ReloadPrompt } from "./components/reload-prompt";
import { ModelViewer } from "./components/model-viewer";
import { OutputPreview } from "./components/output-preview";
import { ENABLE_PWA } from "./lib/base-path";
import {
  JOIN_STYLE_OPTIONS,
  KEEP_MODE_OPTIONS,
  MESH_ACCEPT,
  OFFSET_STAGE_OPTIONS,
  OUTPUT_UNIT_OPTIONS,
  UNIT_OPTIONS,
  VIEW_LABELS,
  VIEW_PRESETS,
  normalizeDirectionInput,
  presetDirection,
  stemFromFileName,
} from "./lib/directions";
import { downloadBase64File, downloadTextFile } from "./lib/download";
import { formatBounds, formatExtents, formatFileSize, formatNumber } from "./lib/format";
import { processMeshFile } from "./lib/mesh-worker-client";
import { prepareMeshFile } from "./lib/model-loader";
import type { PipelineBrowserResult, PreparedMesh, ProcessSettings, ViewPresetName } from "./lib/types";

const DEFAULT_SETTINGS: ProcessSettings = {
  direction: [0, 0, 1],
  ignoreSign: false,
  includeHatch: false,
  joinStyle: "round",
  keepMode: "largest",
  minArea: 0,
  offsetDistance: 0,
  offsetStage: "post_scale",
  outputUnits: "mm",
  precise: true,
  scale: 1,
  simplifyTolerance: 0,
  sourceUnits: null,
  svgStrokeWidth: 0.1,
  viewPreset: "top",
};

export default function App() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mesh, setMesh] = useState<PreparedMesh | null>(null);
  const [result, setResult] = useState<PipelineBrowserResult | null>(null);
  const [settings, setSettings] = useState<ProcessSettings>(DEFAULT_SETTINGS);
  const [statusMessage, setStatusMessage] = useState("Upload a mesh to begin.");

  const exportStem = useMemo(() => stemFromFileName(mesh?.fileName ?? "projection"), [mesh]);

  const activeBadges = [
    "Runs entirely in the browser",
    "3D inspection + 2D SVG preview",
    "DXF download ready",
    "3MF included",
  ];

  async function handleFileSelection(file: File | null) {
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setResult(null);
    setIsPreparing(true);
    setStatusMessage("Parsing uploaded mesh for the live viewer...");

    try {
      const prepared = await prepareMeshFile(file);
      setMesh(prepared);
      setStatusMessage("Mesh ready. Adjust settings and generate a projection.");
    } catch (error) {
      setMesh(null);
      setStatusMessage("Upload a supported mesh to begin.");
      setErrorMessage(error instanceof Error ? error.message : "Unable to parse mesh.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function handleGenerateProjection() {
    if (!mesh) {
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setStatusMessage("Preparing projection worker...");

    try {
      const normalizedDirection = normalizeDirectionInput(settings.direction);
      const output = await processMeshFile(
        mesh,
        {
          ...settings,
          direction: normalizedDirection,
        },
        setStatusMessage,
      );
      setResult(output);
      setStatusMessage("Projection completed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Projection failed.");
      setStatusMessage("Projection failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  function updateSettings<Key extends keyof ProcessSettings>(
    key: Key,
    value: ProcessSettings[Key],
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handlePresetClick(viewPreset: ViewPresetName) {
    if (viewPreset === "custom") {
      updateSettings("viewPreset", "custom");
      return;
    }

    setSettings((current) => ({
      ...current,
      direction: presetDirection(viewPreset),
      viewPreset,
    }));
  }

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header class="studio-panel hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">mesh2cad browser studio</p>
          <h1 class="hero-title">Mesh to CAD outline studio</h1>
          <p class="hero-body">
            Upload a mesh, inspect it in 3D, project it through the Python core in Pyodide,
            and leave with a clean SVG preview plus DXF output you can drop into downstream CAD.
          </p>
          <div class="badge-row">
            {activeBadges.map((badge) => (
              <span class="hero-badge" key={badge}>
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div class="hero-side">
          <div class="hero-status">
            <p class="hero-status-label">Current status</p>
            <p class="hero-status-value">{statusMessage}</p>
            <p class="hero-status-copy">
              Supports STL, OBJ, PLY, GLB, and 3MF. Everything runs client-side, so uploads stay
              in the browser.
            </p>
          </div>
          <button
            class="primary-button"
            disabled={!mesh || isPreparing || isProcessing}
            onClick={handleGenerateProjection}
            type="button"
          >
            {isProcessing ? "Generating..." : "Generate projection"}
          </button>
        </div>
      </header>

      <section class="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div class="flex flex-col gap-6">
          <article class="studio-panel">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Input</p>
                <h2 class="panel-title">Upload and inspect</h2>
              </div>
              {mesh ? (
                <span class="panel-chip">
                  {mesh.fileType.toUpperCase()} · {formatFileSize(mesh.arrayBuffer.byteLength)}
                </span>
              ) : null}
            </div>

            <label class="upload-zone">
              <input
                accept={MESH_ACCEPT}
                class="sr-only"
                onChange={(event) => {
                  const input = event.currentTarget as HTMLInputElement;
                  void handleFileSelection(input.files?.[0] ?? null);
                }}
                type="file"
              />
              <span class="upload-title">
                {isPreparing ? "Loading mesh..." : "Choose a mesh file"}
              </span>
              <span class="upload-copy">
                Drag a production mesh into the browser and preview it before projection.
              </span>
            </label>

            {mesh ? (
              <div class="metric-grid">
                <MetricCard label="File" value={mesh.fileName} />
                <MetricCard label="Meshes" value={String(mesh.meshCount)} />
                <MetricCard label="Triangles" value={mesh.triangleCount.toLocaleString()} />
                <MetricCard label="Extents" value={formatExtents(mesh.extents)} />
              </div>
            ) : null}

            {errorMessage ? <p class="error-banner">{errorMessage}</p> : null}
          </article>

          <article class="studio-panel">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Projection</p>
                <h2 class="panel-title">View direction and sizing</h2>
              </div>
            </div>

            <div class="view-grid">
              {([...Object.keys(VIEW_PRESETS), "custom"] as ViewPresetName[]).map((viewPreset) => (
                <button
                  class={`view-button ${settings.viewPreset === viewPreset ? "is-active" : ""}`}
                  key={viewPreset}
                  onClick={() => handlePresetClick(viewPreset)}
                  type="button"
                >
                  {VIEW_LABELS[viewPreset]}
                </button>
              ))}
            </div>

            <div class="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>X direction</FieldLabel>
                <NumberField
                  onInput={(value) =>
                    setSettings((current) => ({
                      ...current,
                      direction: [value, current.direction[1], current.direction[2]],
                      viewPreset: "custom",
                    }))
                  }
                  value={settings.direction[0]}
                />
              </Field>
              <Field>
                <FieldLabel>Y direction</FieldLabel>
                <NumberField
                  onInput={(value) =>
                    setSettings((current) => ({
                      ...current,
                      direction: [current.direction[0], value, current.direction[2]],
                      viewPreset: "custom",
                    }))
                  }
                  value={settings.direction[1]}
                />
              </Field>
              <Field>
                <FieldLabel>Z direction</FieldLabel>
                <NumberField
                  onInput={(value) =>
                    setSettings((current) => ({
                      ...current,
                      direction: [current.direction[0], current.direction[1], value],
                      viewPreset: "custom",
                    }))
                  }
                  value={settings.direction[2]}
                />
              </Field>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Source units</FieldLabel>
                <SelectField
                  onChange={(value) => updateSettings("sourceUnits", value || null)}
                  options={UNIT_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value ?? "",
                  }))}
                  value={settings.sourceUnits ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel>Output units</FieldLabel>
                <SelectField
                  onChange={(value) => updateSettings("outputUnits", value)}
                  options={OUTPUT_UNIT_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value ?? "",
                  }))}
                  value={settings.outputUnits}
                />
              </Field>
              <Field>
                <FieldLabel>Scale factor</FieldLabel>
                <NumberField onInput={(value) => updateSettings("scale", value)} value={settings.scale} />
              </Field>
              <Field>
                <FieldLabel>Offset distance</FieldLabel>
                <NumberField
                  onInput={(value) => updateSettings("offsetDistance", value)}
                  value={settings.offsetDistance}
                />
              </Field>
            </div>

            <details class="advanced-panel">
              <summary>Advanced cleanup and export controls</summary>
              <div class="mt-4 grid gap-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Keep mode</FieldLabel>
                    <SelectField
                      onChange={(value) => updateSettings("keepMode", value as ProcessSettings["keepMode"])}
                      options={KEEP_MODE_OPTIONS.map((option) => ({
                        label: `${option.value} — ${option.description}`,
                        value: option.value,
                      }))}
                      value={settings.keepMode}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Offset stage</FieldLabel>
                    <SelectField
                      onChange={(value) =>
                        updateSettings("offsetStage", value as ProcessSettings["offsetStage"])
                      }
                      options={OFFSET_STAGE_OPTIONS.map((option) => ({
                        label: `${option.value} — ${option.description}`,
                        value: option.value,
                      }))}
                      value={settings.offsetStage}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Join style</FieldLabel>
                    <SelectField
                      onChange={(value) => updateSettings("joinStyle", value as ProcessSettings["joinStyle"])}
                      options={JOIN_STYLE_OPTIONS.map((option) => ({
                        label: `${option.value} — ${option.description}`,
                        value: option.value,
                      }))}
                      value={settings.joinStyle}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Simplify tolerance</FieldLabel>
                    <NumberField
                      onInput={(value) => updateSettings("simplifyTolerance", value)}
                      value={settings.simplifyTolerance}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Minimum area</FieldLabel>
                    <NumberField
                      onInput={(value) => updateSettings("minArea", value)}
                      value={settings.minArea}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>SVG stroke width</FieldLabel>
                    <NumberField
                      onInput={(value) => updateSettings("svgStrokeWidth", value)}
                      value={settings.svgStrokeWidth}
                    />
                  </Field>
                </div>

                <div class="toggle-grid">
                  <Toggle
                    checked={settings.precise}
                    description="Use trimesh's shapely-backed precise projection path"
                    label="Precise projection"
                    onChange={(value) => updateSettings("precise", value)}
                  />
                  <Toggle
                    checked={settings.ignoreSign}
                    description="Faster for watertight meshes when projection sign does not matter"
                    label="Ignore face sign"
                    onChange={(value) => updateSettings("ignoreSign", value)}
                  />
                  <Toggle
                    checked={settings.includeHatch}
                    description="Emit filled HATCH entities in DXF alongside outline polylines"
                    label="DXF hatch"
                    onChange={(value) => updateSettings("includeHatch", value)}
                  />
                </div>
              </div>
            </details>
          </article>

          <article class="studio-panel">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Outputs</p>
                <h2 class="panel-title">Download geometry</h2>
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <button
                class="secondary-button"
                disabled={!result?.svgText}
                onClick={() => {
                  if (result?.svgText) {
                    downloadTextFile(`${exportStem}.svg`, result.svgText, "image/svg+xml");
                  }
                }}
                type="button"
              >
                Download SVG
              </button>
              <button
                class="secondary-button"
                disabled={!result?.dxfBase64}
                onClick={() => {
                  if (result?.dxfBase64) {
                    downloadBase64File(`${exportStem}.dxf`, result.dxfBase64, "application/dxf");
                  }
                }}
                type="button"
              >
                Download DXF
              </button>
            </div>

            {result ? (
              <div class="metric-grid mt-4">
                <MetricCard label="Area" value={formatNumber(result.area, 3)} />
                <MetricCard label="Bounds" value={formatBounds(result.bounds)} />
                <MetricCard label="Bodies" value={String(result.bodyCount)} />
                <MetricCard label="Units" value={result.units ?? "unchanged"} />
              </div>
            ) : null}

            {result?.warnings.length ? (
              <div class="warning-list">
                {result.warnings.map((warning) => (
                  <p class="warning-item" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </article>
        </div>

        <div class="grid gap-6">
          <article class="studio-panel dark-panel">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Viewer</p>
                <h2 class="panel-title text-stone-50">Uploaded mesh</h2>
              </div>
              {mesh ? (
                <span class="panel-chip panel-chip-dark">
                  {mesh.fileType.toUpperCase()} · {mesh.meshCount} mesh
                  {mesh.meshCount === 1 ? "" : "es"}
                </span>
              ) : null}
            </div>
            <ModelViewer mesh={mesh} />
          </article>

          <article class="studio-panel">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Preview</p>
                <h2 class="panel-title">SVG footprint</h2>
              </div>
              {result?.svgText ? <span class="panel-chip">Ready for DXF export</span> : null}
            </div>
            <OutputPreview
              isBusy={isProcessing}
              statusMessage={statusMessage}
              svgText={result?.svgText ?? null}
            />
          </article>
        </div>
      </section>

      <footer class="footer-panel">
        <p>
          Base path aware static app for GitHub Pages, with the current Python package synced into
          the site at build time.
        </p>
        <p>
          Projection direction: <code>{settings.direction.map((value) => formatNumber(value, 3)).join(", ")}</code>
        </p>
      </footer>

      {ENABLE_PWA ? <ReloadPrompt /> : null}
    </main>
  );
}

function Field(props: { children: preact.ComponentChildren }) {
  return <label class="field">{props.children}</label>;
}

function FieldLabel(props: { children: preact.ComponentChildren }) {
  return <span class="field-label">{props.children}</span>;
}

function NumberField(props: { onInput: (value: number) => void; value: number }) {
  return (
    <input
      class="field-input"
      inputMode="decimal"
      onInput={(event) => {
        const next = Number((event.currentTarget as HTMLInputElement).value);
        props.onInput(Number.isFinite(next) ? next : 0);
      }}
      type="number"
      value={String(props.value)}
    />
  );
}

function SelectField(props: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <select
      class="field-input"
      onChange={(event) => props.onChange((event.currentTarget as HTMLSelectElement).value)}
      value={props.value}
    >
      {props.options.map((option) => (
        <option key={option.value || "blank"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle(props: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="toggle-card">
      <input
        checked={props.checked}
        onChange={(event) => props.onChange((event.currentTarget as HTMLInputElement).checked)}
        type="checkbox"
      />
      <div>
        <p class="toggle-label">{props.label}</p>
        <p class="toggle-description">{props.description}</p>
      </div>
    </label>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div class="metric-card">
      <p class="metric-label">{props.label}</p>
      <p class="metric-value">{props.value}</p>
    </div>
  );
}
