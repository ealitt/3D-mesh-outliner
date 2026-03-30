import { useRegisterSW } from "virtual:pwa-register/preact";
import type { ReloadPromptCopy } from "../lib/i18n";

const DEFAULT_COPY: ReloadPromptCopy = {
  dismiss: "Dismiss",
  offlineReadyCopy: "This app is cached and can work offline.",
  offlineReadyTitle: "App ready offline",
  reload: "Reload",
  updateCopy: "A newer version has been cached. Reload when you're ready.",
  updateTitle: "Update available",
};

export function ReloadPrompt(props: { copy?: ReloadPromptCopy }) {
  const copy = props.copy ?? DEFAULT_COPY;
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <aside class="glass fixed right-4 bottom-4 z-50 max-w-sm rounded-2xl p-4 shadow-2xl">
      <div class="flex flex-col gap-3">
        <div>
          <p class="text-sm font-semibold text-slate-100">
            {offlineReady ? copy.offlineReadyTitle : copy.updateTitle}
          </p>
          <p class="mt-1 text-sm text-slate-300">
            {offlineReady
              ? copy.offlineReadyCopy
              : copy.updateCopy}
          </p>
        </div>
        <div class="flex gap-2">
          {needRefresh ? (
            <button
              class="rounded-xl bg-cyan-400 px-3 py-2 text-sm font-medium text-slate-950 transition hover:opacity-90"
              onClick={() => updateServiceWorker(true)}
            >
              {copy.reload}
            </button>
          ) : null}
          <button
            class="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            onClick={close}
          >
            {copy.dismiss}
          </button>
        </div>
      </div>
    </aside>
  );
}
