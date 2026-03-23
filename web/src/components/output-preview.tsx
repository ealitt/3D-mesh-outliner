import { useEffect, useState } from "preact/hooks";

export function OutputPreview(props: {
  isBusy: boolean;
  statusMessage: string;
  svgText: string | null;
}) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!props.svgText) {
      setSvgUrl(null);
      return;
    }

    const blob = new Blob([props.svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setSvgUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [props.svgText]);

  return (
    <div class="preview-shell">
      {svgUrl ? (
        <img alt="Generated SVG projection preview" class="preview-image" src={svgUrl} />
      ) : (
        <div class="preview-placeholder">
          <p class="preview-placeholder-title">2D output preview</p>
          <p class="preview-placeholder-copy">
            {props.isBusy
              ? props.statusMessage
              : "The generated SVG footprint will appear here once you run the projection."}
          </p>
        </div>
      )}
    </div>
  );
}
