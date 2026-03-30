import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { OutputPreviewCopy } from "../lib/i18n";
import type { FocusOutlineRequest, PreviewSelectionDetails, RingSet2D } from "../lib/types";

const CLICK_MOVE_TOLERANCE = 6;
const MAX_SCALE = 12;
const MIN_SCALE = 1;
const FOCUS_ANIMATION_MS = 240;
const FOCUS_PADDING = 0.18;
const FOCUS_MAX_RELATIVE_VIEWBOX = 2.4;
const ZOOM_INTENSITY = 0.0015;

const DEFAULT_COPY: OutputPreviewCopy = {
  generatedSvgAriaLabel: "Generated SVG projection preview",
  placeholderCopy: "The generated SVG footprint will appear here once you run the projection.",
  placeholderTitle: "2D output preview",
  resetView: "Reset view",
};

type ViewBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type SvgTransformMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type SvgTransformEntry = {
  matrix: SvgTransformMatrix;
  tagName: string;
  transform: string | null;
};

type FocusBoundsResolution = {
  bounds: ViewBox;
  source: "svg-dom";
  transformChain: SvgTransformEntry[];
};

export function OutputPreview(props: {
  copy?: OutputPreviewCopy;
  focusRequest: FocusOutlineRequest | null;
  geometryKey: string;
  hoveredMeshId: string | null;
  isBusy: boolean;
  onHoverMeshChange: (meshId: string | null) => void;
  onSelectMesh: (meshId: string | null, details?: PreviewSelectionDetails) => void;
  selectedMeshId: string | null;
  statusMessage: string;
  svgText: string | null;
  viewportResetKey?: string;
}) {
  const copy = props.copy ?? DEFAULT_COPY;
  const viewportResetKey = props.viewportResetKey ?? props.geometryKey;
  const hoveredMeshIdRef = useRef(props.hoveredMeshId);
  const currentViewBoxRef = useRef<ViewBox | null>(null);
  const lastFocusNonceRef = useRef<number | null>(null);
  const lastViewportResetKeyRef = useRef(viewportResetKey);
  const previewRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    didDrag: boolean;
    originViewBox: ViewBox;
    pointerId: number;
    startMeshId: string | null;
    startX: number;
    startY: number;
  } | null>(null);
  const inlineSvgText = useMemo(
    () => props.svgText?.replace(/^\s*<\?xml[^>]*>\s*/u, "") ?? null,
    [props.svgText],
  );
  const [baseViewBox, setBaseViewBox] = useState<ViewBox | null>(null);
  const [currentViewBox, setCurrentViewBox] = useState<ViewBox | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    hoveredMeshIdRef.current = props.hoveredMeshId;
  }, [props.hoveredMeshId]);

  useEffect(() => {
    currentViewBoxRef.current = currentViewBox;
  }, [currentViewBox]);

  useEffect(() => () => {
    stopViewAnimation(animationFrameRef);
  }, []);

  useLayoutEffect(() => {
    if (inlineSvgText) {
      return;
    }

    stopViewAnimation(animationFrameRef);
    dragStateRef.current = null;
    currentViewBoxRef.current = null;
    setIsDragging(false);
    setBaseViewBox(null);
    setCurrentViewBox(null);
  }, [inlineSvgText]);

  useLayoutEffect(() => {
    const svg = getPreviewSvg(previewRef.current);
    if (!svg) {
      return;
    }

    const nextBaseViewBox = parseViewBox(svg);
    if (!nextBaseViewBox) {
      return;
    }

    const currentLiveViewBox = currentViewBoxRef.current;
    const resetScopeChanged = lastViewportResetKeyRef.current !== viewportResetKey;
    lastViewportResetKeyRef.current = viewportResetKey;

    stopViewAnimation(animationFrameRef);
    dragStateRef.current = null;
    setIsDragging(false);
    setBaseViewBox(nextBaseViewBox);

    if (!currentLiveViewBox || resetScopeChanged) {
      currentViewBoxRef.current = nextBaseViewBox;
      setCurrentViewBox(nextBaseViewBox);
      window.requestAnimationFrame(() => {
        const paintedSvg = getPreviewSvg(previewRef.current);
        pushPreviewFocusLog("preview-geometry-viewbox-reset", {
          currentViewBoxAfter: serializeViewBox(nextBaseViewBox),
          currentViewBoxBefore: serializeViewBox(currentLiveViewBox),
          fitToContentRan: true,
          geometryKey: props.geometryKey,
          paintedViewBox: serializeViewBox(paintedSvg ? parseViewBox(paintedSvg) : null),
          resetScopeChanged,
          selectedMeshId: props.selectedMeshId,
          viewportResetKey,
        });
      });
      return;
    }

    currentViewBoxRef.current = currentLiveViewBox;
    setCurrentViewBox(currentLiveViewBox);
    window.requestAnimationFrame(() => {
      const paintedSvg = getPreviewSvg(previewRef.current);
      pushPreviewFocusLog("preview-geometry-viewbox-preserved", {
        currentViewBoxAfter: serializeViewBox(currentLiveViewBox),
        currentViewBoxBefore: serializeViewBox(currentLiveViewBox),
        fitToContentRan: false,
        geometryKey: props.geometryKey,
        nextBaseViewBox: serializeViewBox(nextBaseViewBox),
        paintedViewBox: serializeViewBox(paintedSvg ? parseViewBox(paintedSvg) : null),
        resetScopeChanged,
        selectedMeshId: props.selectedMeshId,
        selectionRefocusRan: false,
        viewportResetKey,
      });
    });
  }, [props.geometryKey, props.selectedMeshId, viewportResetKey]);

  useLayoutEffect(() => {
    const svg = getPreviewSvg(previewRef.current);
    const nextViewBox = currentViewBox ?? currentViewBoxRef.current;
    if (!svg || !nextViewBox) {
      return;
    }

    svg.setAttribute("viewBox", formatViewBox(nextViewBox));
  }, [currentViewBox, inlineSvgText]);

  useEffect(() => {
    if (!props.focusRequest) {
      lastFocusNonceRef.current = null;
      return;
    }

    if (!baseViewBox || lastFocusNonceRef.current === props.focusRequest.nonce) {
      return;
    }

    const sourceViewBox = currentViewBoxRef.current ?? currentViewBox ?? baseViewBox;
    const previewRect = getPreviewSvgRect(previewRef.current);
    const previewSvg = getPreviewSvg(previewRef.current);
    const aspectRatio = previewRect
      ? previewRect.width / previewRect.height
      : (baseViewBox.width / baseViewBox.height);
    const focusResolution = resolveFocusBounds(
      previewRef.current,
      props.selectedMeshId,
    );
    if (!focusResolution) {
      pushPreviewFocusLog("preview-focus-dom-bounds-missing", {
        currentViewBox: serializeViewBox(sourceViewBox),
        fallbackBoundsAvailable: Boolean(boundsFromRings(props.focusRequest.rings)),
        selectedMeshId: props.selectedMeshId,
        svgPreserveAspectRatio: serializePreserveAspectRatio(previewSvg),
        svgViewBoxBaseVal: serializeSvgViewBoxBaseVal(previewSvg),
      });
      return;
    }

    lastFocusNonceRef.current = props.focusRequest.nonce;
    const focusTarget = buildFocusTargetViewBox(focusResolution.bounds, sourceViewBox, aspectRatio);
    const selectedCenter = centerOfViewBox(focusResolution.bounds);
    const selectedCenterScreenBefore = mapSvgPointToScreen(previewRef.current, selectedCenter.x, selectedCenter.y);
    const selectedCenterScreenAfterTarget = mapSvgPointToScreenForViewBox(
      previewRef.current,
      focusTarget.targetViewBox,
      selectedCenter.x,
      selectedCenter.y,
    );
    const svgViewBoxBaseVal = serializeSvgViewBoxBaseVal(previewSvg);
    const svgPreserveAspectRatio = serializePreserveAspectRatio(previewSvg);

    pushPreviewFocusLog("preview-focus-start", {
      currentViewBox: serializeViewBox(sourceViewBox),
      nextViewBox: serializeViewBox(focusTarget.targetViewBox),
      panAfter: serializePan(baseViewBox, focusTarget.targetViewBox),
      panBefore: serializePan(baseViewBox, sourceViewBox),
      selectedBounds: serializeViewBox(focusTarget.selectedBounds),
      selectedBoundsSource: focusResolution.source,
      selectedCenterScreenAfter: selectedCenterScreenAfterTarget,
      selectedCenterScreenBefore,
      selectedMeshId: props.selectedMeshId,
      svgPreserveAspectRatio,
      svgTransformChain: focusResolution.transformChain,
      svgViewBoxBaseVal,
      viewportSize: serializeViewportSize(previewRect),
      zoomAfter: roundTo(viewBoxZoom(baseViewBox, focusTarget.targetViewBox), 4),
      zoomBefore: roundTo(viewBoxZoom(baseViewBox, sourceViewBox), 4),
    });

    animateViewBox(
      animationFrameRef,
      sourceViewBox,
      focusTarget.targetViewBox,
      (nextViewBox) => {
        currentViewBoxRef.current = nextViewBox;
        setCurrentViewBox(nextViewBox);
      },
      () => {
        const focusNonce = props.focusRequest?.nonce ?? null;
        window.requestAnimationFrame(() => {
          if (lastFocusNonceRef.current !== focusNonce) {
            return;
          }

          const paintedSvg = getPreviewSvg(previewRef.current);
          pushPreviewFocusLog("preview-focus-end", {
            currentViewBox: serializeViewBox(sourceViewBox),
            finalScreenSpaceSelectedBounds: measureSelectedMeshScreenBounds(previewRef.current, props.selectedMeshId),
            nextViewBox: serializeViewBox(focusTarget.targetViewBox),
            paintedViewBox: serializeViewBox(paintedSvg ? parseViewBox(paintedSvg) : null),
            panAfter: serializePan(baseViewBox, focusTarget.targetViewBox),
            panBefore: serializePan(baseViewBox, sourceViewBox),
            selectedBounds: serializeViewBox(focusTarget.selectedBounds),
            selectedBoundsSource: focusResolution.source,
            selectedCenterScreenAfter: measureSelectedMeshScreenCenter(previewRef.current, props.selectedMeshId),
            selectedCenterScreenAfterTarget,
            selectedCenterScreenBefore,
            selectedMeshId: props.selectedMeshId,
            svgPreserveAspectRatio: serializePreserveAspectRatio(paintedSvg),
            svgTransformChain: focusResolution.transformChain,
            svgViewBoxBaseVal: serializeSvgViewBoxBaseVal(paintedSvg),
            viewportSize: serializeViewportSize(getPreviewSvgRect(previewRef.current)),
            zoomAfter: roundTo(viewBoxZoom(baseViewBox, focusTarget.targetViewBox), 4),
            zoomBefore: roundTo(viewBoxZoom(baseViewBox, sourceViewBox), 4),
          });
        });
      },
    );
  }, [baseViewBox, currentViewBox, props.focusRequest?.nonce, props.selectedMeshId]);

  function updateHoveredMeshId(nextMeshId: string | null) {
    if (hoveredMeshIdRef.current === nextMeshId) {
      return;
    }
    hoveredMeshIdRef.current = nextMeshId;
    props.onHoverMeshChange(nextMeshId);
  }

  function updateViewBox(nextViewBox: ViewBox) {
    stopViewAnimation(animationFrameRef);
    currentViewBoxRef.current = nextViewBox;
    setCurrentViewBox(nextViewBox);
  }

  const isZoomedIn = Boolean(
    baseViewBox
    && currentViewBox
    && ((baseViewBox.width / currentViewBox.width) > (MIN_SCALE + 0.01)),
  );
  const interactiveViewBox = currentViewBox ?? baseViewBox;

  function handleResetView() {
    if (!baseViewBox || !interactiveViewBox) {
      return;
    }
    animateViewBox(
      animationFrameRef,
      interactiveViewBox,
      baseViewBox,
      (nextViewBox) => {
        currentViewBoxRef.current = nextViewBox;
        setCurrentViewBox(nextViewBox);
      },
    );
  }

  return (
    <div class="preview-shell">
      {inlineSvgText ? (
        <div
          aria-label={copy.generatedSvgAriaLabel}
          class={`preview-svg ${isDragging ? "is-dragging" : ""}`}
          onDblClick={handleResetView}
          onPointerDown={(event) => {
            if (event.button !== 0 || !interactiveViewBox) {
              return;
            }

            const target = event.target;
            if (target instanceof Element && target.closest("button")) {
              return;
            }

            const container = event.currentTarget as HTMLDivElement;
            dragStateRef.current = {
              didDrag: false,
              originViewBox: interactiveViewBox,
              pointerId: event.pointerId,
              startMeshId: getMeshIdFromTarget(target),
              startX: event.clientX,
              startY: event.clientY,
            };
            stopViewAnimation(animationFrameRef);
            container.setPointerCapture?.(event.pointerId);
          }}
          onPointerLeave={() => {
            if (!dragStateRef.current && !props.selectedMeshId) {
              updateHoveredMeshId(null);
            }
          }}
          onPointerMove={(event) => {
            const dragState = dragStateRef.current;
            if (dragState && dragState.pointerId === event.pointerId) {
              const deltaX = event.clientX - dragState.startX;
              const deltaY = event.clientY - dragState.startY;
              if (!dragState.didDrag && Math.hypot(deltaX, deltaY) > CLICK_MOVE_TOLERANCE) {
                dragState.didDrag = true;
                setIsDragging(true);
                updateHoveredMeshId(null);
              }
              if (!dragState.didDrag) {
                return;
              }

              const svgRect = getPreviewSvgRect(previewRef.current);
              if (!svgRect) {
                return;
              }

              const nextViewBox = {
                ...dragState.originViewBox,
                x: dragState.originViewBox.x - ((deltaX / svgRect.width) * dragState.originViewBox.width),
                y: dragState.originViewBox.y - ((deltaY / svgRect.height) * dragState.originViewBox.height),
              };
              currentViewBoxRef.current = nextViewBox;
              setCurrentViewBox(nextViewBox);
              return;
            }

            if (isDragging) {
              return;
            }

            if (props.selectedMeshId) {
              return;
            }

            const target = event.target;
            updateHoveredMeshId(getMeshIdFromTarget(target));
          }}
          onPointerUp={(event) => {
            const dragState = dragStateRef.current;
            if (dragState?.pointerId !== event.pointerId) {
              return;
            }

            const container = event.currentTarget as HTMLDivElement;
            if (!dragState.didDrag) {
              const clickedMeshId = getMeshIdFromClientPoint(previewRef.current, event.clientX, event.clientY)
                ?? dragState.startMeshId;
              props.onSelectMesh(clickedMeshId, {
                clickedMeshId,
                clientX: event.clientX,
                clientY: event.clientY,
              });
            }

            dragStateRef.current = null;
            setIsDragging(false);
            container.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (dragStateRef.current?.pointerId !== event.pointerId) {
              return;
            }

            const container = event.currentTarget as HTMLDivElement;
            dragStateRef.current = null;
            setIsDragging(false);
            container.releasePointerCapture?.(event.pointerId);
          }}
          onWheel={(event) => {
            if (!baseViewBox || !interactiveViewBox) {
              return;
            }

            event.preventDefault();
            const svgRect = getPreviewSvgRect(previewRef.current);
            if (!svgRect) {
              return;
            }

            const currentAspectRatio = interactiveViewBox.width / interactiveViewBox.height;
            if (!Number.isFinite(currentAspectRatio) || currentAspectRatio <= 0) {
              return;
            }

            const zoomBoundsViewBox = fitViewBoxToAspect(baseViewBox, currentAspectRatio);
            const zoomFactor = Math.exp(event.deltaY * ZOOM_INTENSITY);
            const minWidth = zoomBoundsViewBox.width / MAX_SCALE;
            const maxWidth = Math.max(zoomBoundsViewBox.width, interactiveViewBox.width);
            const unclampedWidth = interactiveViewBox.width * zoomFactor;
            const nextWidth = clampValue(unclampedWidth, minWidth, maxWidth);
            if (Math.abs(nextWidth - interactiveViewBox.width) < 0.0001) {
              return;
            }

            const viewScale = nextWidth / interactiveViewBox.width;
            const nextHeight = interactiveViewBox.height * viewScale;
            const pointerRatioX = (event.clientX - svgRect.left) / svgRect.width;
            const pointerRatioY = (event.clientY - svgRect.top) / svgRect.height;
            const svgX = interactiveViewBox.x + (pointerRatioX * interactiveViewBox.width);
            const svgY = interactiveViewBox.y + (pointerRatioY * interactiveViewBox.height);
            const nextViewBox = {
              height: nextHeight,
              width: nextWidth,
              x: svgX - (pointerRatioX * nextWidth),
              y: svgY - (pointerRatioY * nextHeight),
            };

            pushPreviewFocusLog("preview-wheel-zoom", {
              currentViewBoxAfter: serializeViewBox(nextViewBox),
              currentViewBoxBefore: serializeViewBox(interactiveViewBox),
              deltaY: roundTo(event.deltaY, 3),
              fitToContentRan: false,
              selectedMeshId: props.selectedMeshId,
              selectionRefocusRan: false,
              zoomBoundsViewBox: serializeViewBox(zoomBoundsViewBox),
            });

            updateViewBox(nextViewBox);
            window.requestAnimationFrame(() => {
              const paintedSvg = getPreviewSvg(previewRef.current);
              pushPreviewFocusLog("preview-wheel-zoom-end", {
                currentViewBoxAfter: serializeViewBox(nextViewBox),
                currentViewBoxBefore: serializeViewBox(interactiveViewBox),
                deltaY: roundTo(event.deltaY, 3),
                paintedViewBox: serializeViewBox(paintedSvg ? parseViewBox(paintedSvg) : null),
                selectedMeshId: props.selectedMeshId,
                selectionRefocusRan: false,
              });
            });
          }}
          ref={previewRef}
          role="group"
        >
          {isZoomedIn ? (
            <button
              class="preview-reset-button secondary-button"
              onClick={(event) => {
                event.stopPropagation();
                handleResetView();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              {copy.resetView}
            </button>
          ) : null}
          <div class="preview-svg-stage">
            <div
              class="preview-svg-content"
              dangerouslySetInnerHTML={{ __html: inlineSvgText }}
            />
          </div>
        </div>
      ) : (
        <div class="preview-placeholder">
          <p class="preview-placeholder-title">{copy.placeholderTitle}</p>
          <p class="preview-placeholder-copy">
            {props.isBusy
              ? props.statusMessage
              : copy.placeholderCopy}
          </p>
        </div>
      )}
    </div>
  );
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function animateViewBox(
  animationFrameRef: { current: number | null },
  from: ViewBox,
  to: ViewBox,
  onUpdate: (viewBox: ViewBox) => void,
  onComplete?: () => void,
) {
  stopViewAnimation(animationFrameRef);
  const start = performance.now();

  const step = (timestamp: number) => {
    const progress = Math.min(1, (timestamp - start) / FOCUS_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    onUpdate(interpolateViewBox(from, to, eased));
    if (progress < 1) {
      animationFrameRef.current = window.requestAnimationFrame(step);
    } else {
      animationFrameRef.current = null;
      onComplete?.();
    }
  };

  animationFrameRef.current = window.requestAnimationFrame(step);
}

function boundsFromRings(rings: RingSet2D[]): ViewBox | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const ring of rings) {
    for (const point of ring.exterior) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }

    for (const hole of ring.holes) {
      for (const point of hole) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    height: Math.max(0.001, maxY - minY),
    width: Math.max(0.001, maxX - minX),
    x: minX,
    y: minY,
  };
}

function buildFocusTargetViewBox(
  selectedBounds: ViewBox,
  currentViewBox: ViewBox,
  aspectRatio: number,
) {
  const paddedBounds = padViewBox(selectedBounds, FOCUS_PADDING);
  const fitSize = fitViewBoxSizeToBounds(paddedBounds.width, paddedBounds.height, aspectRatio);
  const shouldFitSelection = paddedBounds.width > currentViewBox.width
    || paddedBounds.height > currentViewBox.height
    || currentViewBox.width > fitSize.width * FOCUS_MAX_RELATIVE_VIEWBOX
    || currentViewBox.height > fitSize.height * FOCUS_MAX_RELATIVE_VIEWBOX;
  const bboxCenterX = selectedBounds.x + (selectedBounds.width / 2);
  const bboxCenterY = selectedBounds.y + (selectedBounds.height / 2);
  const nextViewBoxWidth = shouldFitSelection ? fitSize.width : currentViewBox.width;
  const nextViewBoxHeight = shouldFitSelection ? fitSize.height : currentViewBox.height;
  const targetViewBox = {
    height: nextViewBoxHeight,
    width: nextViewBoxWidth,
    x: bboxCenterX - (nextViewBoxWidth / 2),
    y: bboxCenterY - (nextViewBoxHeight / 2),
  };

  return {
    selectedBounds,
    targetViewBox,
  };
}

function resolveFocusBounds(
  preview: HTMLDivElement | null,
  meshId: string | null,
): FocusBoundsResolution | null {
  return measureMeshBoundsInSvgSpace(preview, meshId);
}

function fitViewBoxToBounds(
  bounds: ViewBox,
  aspectRatio: number,
): ViewBox {
  const paddedBounds = padViewBox(bounds, FOCUS_PADDING);
  const { height: targetHeight, width: targetWidth } = fitViewBoxSizeToBounds(
    paddedBounds.width,
    paddedBounds.height,
    aspectRatio,
  );

  return {
    height: targetHeight,
    width: targetWidth,
    x: bounds.x + (bounds.width / 2) - (targetWidth / 2),
    y: bounds.y + (bounds.height / 2) - (targetHeight / 2),
  };
}

function fitViewBoxToAspect(
  bounds: ViewBox,
  aspectRatio: number,
): ViewBox {
  const { height: targetHeight, width: targetWidth } = fitViewBoxSizeToBounds(
    bounds.width,
    bounds.height,
    aspectRatio,
  );

  return {
    height: targetHeight,
    width: targetWidth,
    x: bounds.x + (bounds.width / 2) - (targetWidth / 2),
    y: bounds.y + (bounds.height / 2) - (targetHeight / 2),
  };
}

function formatViewBox(viewBox: ViewBox): string {
  return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
}

function getPreviewAspectRatio(preview: HTMLDivElement | null): number | null {
  const rect = getPreviewSvgRect(preview);
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return rect.width / rect.height;
}

function getPreviewSvg(preview: HTMLDivElement | null): SVGSVGElement | null {
  return preview?.querySelector("svg") ?? null;
}

function getPreviewSvgRect(preview: HTMLDivElement | null): DOMRect | null {
  const svg = getPreviewSvg(preview);
  return svg?.getBoundingClientRect() ?? null;
}

function measureMeshBoundsInSvgSpace(
  preview: HTMLDivElement | null,
  meshId: string | null,
): FocusBoundsResolution | null {
  if (!preview || !meshId) {
    return null;
  }

  const selector = `[data-mesh-id="${escapeAttributeValue(meshId)}"]`;
  const target = preview.querySelector(selector);
  if (!(target instanceof SVGGraphicsElement)) {
    return null;
  }

  const bbox = target.getBBox?.();
  if (!bbox) {
    return null;
  }

  const transformChain = collectSvgTransformChain(target);
  const localBounds = {
    height: Math.max(0.001, bbox.height),
    width: Math.max(0.001, bbox.width),
    x: bbox.x,
    y: bbox.y,
  };
  const bounds = transformChain.length
    ? applyTransformChainToBounds(localBounds, transformChain)
    : localBounds;

  return {
    bounds,
    source: "svg-dom",
    transformChain,
  };
}

function collectSvgTransformChain(target: SVGGraphicsElement): SvgTransformEntry[] {
  const chain: SvgTransformEntry[] = [];
  let current: Element | null = target;

  while (current && !(current instanceof SVGSVGElement)) {
    if (current instanceof SVGGraphicsElement) {
      const matrix = getOwnTransformMatrix(current);
      const transform = current.getAttribute("transform");
      if (matrix && (!isIdentityMatrix(matrix) || transform)) {
        chain.push({
          matrix,
          tagName: current.tagName.toLowerCase(),
          transform,
        });
      }
    }
    current = current.parentElement;
  }

  return chain;
}

function getOwnTransformMatrix(element: SVGGraphicsElement): SvgTransformMatrix | null {
  const consolidated = element.transform?.baseVal?.consolidate?.();
  const matrix = consolidated?.matrix;
  if (!matrix) {
    return null;
  }

  return {
    a: matrix.a,
    b: matrix.b,
    c: matrix.c,
    d: matrix.d,
    e: matrix.e,
    f: matrix.f,
  };
}

function applyTransformChainToBounds(bounds: ViewBox, transformChain: SvgTransformEntry[]): ViewBox {
  let corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];

  for (const entry of transformChain) {
    corners = corners.map((corner) => applyMatrixToPoint(entry.matrix, corner.x, corner.y));
  }

  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    height: Math.max(0.001, maxY - minY),
    width: Math.max(0.001, maxX - minX),
    x: minX,
    y: minY,
  };
}

function applyMatrixToPoint(matrix: SvgTransformMatrix, x: number, y: number) {
  return {
    x: (matrix.a * x) + (matrix.c * y) + matrix.e,
    y: (matrix.b * x) + (matrix.d * y) + matrix.f,
  };
}

function isIdentityMatrix(matrix: SvgTransformMatrix): boolean {
  return matrix.a === 1
    && matrix.b === 0
    && matrix.c === 0
    && matrix.d === 1
    && matrix.e === 0
    && matrix.f === 0;
}

function padViewBox(bounds: ViewBox, padding: number): ViewBox {
  const widthPadding = bounds.width * padding;
  const heightPadding = bounds.height * padding;
  return {
    height: bounds.height + (heightPadding * 2),
    width: bounds.width + (widthPadding * 2),
    x: bounds.x - widthPadding,
    y: bounds.y - heightPadding,
  };
}

function fitViewBoxSizeToBounds(width: number, height: number, aspectRatio: number) {
  let nextWidth = Math.max(width, 0.001);
  let nextHeight = Math.max(height, 0.001);

  if ((nextWidth / nextHeight) > aspectRatio) {
    nextHeight = nextWidth / aspectRatio;
  } else {
    nextWidth = nextHeight * aspectRatio;
  }

  return {
    height: nextHeight,
    width: nextWidth,
  };
}

function getMeshIdFromClientPoint(
  preview: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): string | null {
  if (!preview) {
    return null;
  }

  const elementFromPoint = typeof document.elementFromPoint === "function"
    ? document.elementFromPoint.bind(document)
    : null;
  if (!elementFromPoint) {
    return null;
  }

  const target = elementFromPoint(clientX, clientY);
  if (!(target instanceof Element) || !preview.contains(target)) {
    return null;
  }

  return getMeshIdFromTarget(target);
}

function getMeshIdFromTarget(target: EventTarget | null): string | null {
  return target instanceof Element
    ? target.closest("[data-mesh-id]")?.getAttribute("data-mesh-id") ?? null
    : null;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function interpolateViewBox(from: ViewBox, to: ViewBox, progress: number): ViewBox {
  return {
    height: from.height + ((to.height - from.height) * progress),
    width: from.width + ((to.width - from.width) * progress),
    x: from.x + ((to.x - from.x) * progress),
    y: from.y + ((to.y - from.y) * progress),
  };
}

function parseViewBox(svg: SVGSVGElement): ViewBox | null {
  const rawViewBox = svg.getAttribute("viewBox");
  if (!rawViewBox) {
    return null;
  }

  const parts = rawViewBox.trim().split(/\s+/u).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    height: parts[3],
    width: parts[2],
    x: parts[0],
    y: parts[1],
  };
}

function stopViewAnimation(animationFrameRef: { current: number | null }) {
  if (animationFrameRef.current === null) {
    return;
  }

  window.cancelAnimationFrame(animationFrameRef.current);
  animationFrameRef.current = null;
}

function viewBoxZoom(baseViewBox: ViewBox, currentViewBox: ViewBox): number {
  return baseViewBox.width / currentViewBox.width;
}

function serializeViewBox(viewBox: ViewBox | null) {
  if (!viewBox) {
    return null;
  }

  return {
    height: roundTo(viewBox.height, 4),
    width: roundTo(viewBox.width, 4),
    x: roundTo(viewBox.x, 4),
    y: roundTo(viewBox.y, 4),
  };
}

function serializePan(baseViewBox: ViewBox, currentViewBox: ViewBox) {
  return {
    x: roundTo(currentViewBox.x - baseViewBox.x, 4),
    y: roundTo(currentViewBox.y - baseViewBox.y, 4),
  };
}

function serializeViewportSize(rect: DOMRect | null) {
  if (!rect) {
    return null;
  }

  return {
    height: roundTo(rect.height, 3),
    width: roundTo(rect.width, 3),
  };
}

function serializeSvgViewBoxBaseVal(svg: SVGSVGElement | null) {
  const baseVal = svg?.viewBox?.baseVal;
  if (!baseVal) {
    return null;
  }

  return {
    height: roundTo(baseVal.height, 4),
    width: roundTo(baseVal.width, 4),
    x: roundTo(baseVal.x, 4),
    y: roundTo(baseVal.y, 4),
  };
}

function serializePreserveAspectRatio(svg: SVGSVGElement | null) {
  const baseVal = svg?.preserveAspectRatio?.baseVal;
  if (!baseVal) {
    return null;
  }

  return {
    align: baseVal.align,
    meetOrSlice: baseVal.meetOrSlice,
  };
}

function centerOfViewBox(viewBox: ViewBox) {
  return {
    x: viewBox.x + (viewBox.width / 2),
    y: viewBox.y + (viewBox.height / 2),
  };
}

function mapSvgPointToScreen(
  preview: HTMLDivElement | null,
  x: number,
  y: number,
) {
  const svg = getPreviewSvg(preview);
  const svgRect = getPreviewSvgRect(preview);
  const matrix = svg?.getScreenCTM?.();
  if (!svg || !svgRect || !matrix) {
    return null;
  }

  const point = applyMatrixToPoint(
    {
      a: matrix.a,
      b: matrix.b,
      c: matrix.c,
      d: matrix.d,
      e: matrix.e,
      f: matrix.f,
    },
    x,
    y,
  );
  return {
    screenX: roundTo(point.x, 3),
    screenY: roundTo(point.y, 3),
    viewportX: roundTo(point.x - svgRect.left, 3),
    viewportY: roundTo(point.y - svgRect.top, 3),
  };
}

function mapSvgPointToScreenForViewBox(
  preview: HTMLDivElement | null,
  viewBox: ViewBox,
  x: number,
  y: number,
) {
  const svgRect = getPreviewSvgRect(preview);
  if (!svgRect) {
    return null;
  }

  const screenX = svgRect.left + (((x - viewBox.x) / viewBox.width) * svgRect.width);
  const screenY = svgRect.top + (((y - viewBox.y) / viewBox.height) * svgRect.height);
  return {
    screenX: roundTo(screenX, 3),
    screenY: roundTo(screenY, 3),
    viewportX: roundTo(screenX - svgRect.left, 3),
    viewportY: roundTo(screenY - svgRect.top, 3),
  };
}

function measureSelectedMeshScreenBounds(
  preview: HTMLDivElement | null,
  meshId: string | null,
) {
  if (!preview || !meshId) {
    return null;
  }

  const svgRect = getPreviewSvgRect(preview);
  const target = preview.querySelector(`[data-mesh-id="${escapeAttributeValue(meshId)}"]`);
  if (!svgRect || !(target instanceof Element)) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  return {
    bottom: roundTo(rect.bottom - svgRect.top, 3),
    height: roundTo(rect.height, 3),
    left: roundTo(rect.left - svgRect.left, 3),
    right: roundTo(rect.right - svgRect.left, 3),
    top: roundTo(rect.top - svgRect.top, 3),
    width: roundTo(rect.width, 3),
  };
}

function measureSelectedMeshScreenCenter(
  preview: HTMLDivElement | null,
  meshId: string | null,
) {
  if (!preview || !meshId) {
    return null;
  }

  const svgRect = getPreviewSvgRect(preview);
  const target = preview.querySelector(`[data-mesh-id="${escapeAttributeValue(meshId)}"]`);
  if (!svgRect || !(target instanceof Element)) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  const screenX = rect.left + (rect.width / 2);
  const screenY = rect.top + (rect.height / 2);
  return {
    screenX: roundTo(screenX, 3),
    screenY: roundTo(screenY, 3),
    viewportX: roundTo(screenX - svgRect.left, 3),
    viewportY: roundTo(screenY - svgRect.top, 3),
  };
}

function pushPreviewFocusLog(stage: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  const entry = {
    stage,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.debug("[mesh-preview-debug]", entry);
  const debugWindow = window as Window & {
    __meshPreviewDebugLogs?: Array<Record<string, unknown>>;
  };
  debugWindow.__meshPreviewDebugLogs = [...(debugWindow.__meshPreviewDebugLogs ?? []).slice(-29), entry];
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
