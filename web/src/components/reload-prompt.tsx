import { useRegisterSW } from "virtual:pwa-register/preact";

export function ReloadPrompt() {
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
            {offlineReady ? "App ready offline" : "Update available"}
          </p>
          <p class="mt-1 text-sm text-slate-300">
            {offlineReady
              ? "This app is cached and can work offline."
              : "A newer version has been cached. Reload when you're ready."}
          </p>
        </div>
        <div class="flex gap-2">
          {needRefresh ? (
            <button
              class="rounded-xl bg-cyan-400 px-3 py-2 text-sm font-medium text-slate-950 transition hover:opacity-90"
              onClick={() => updateServiceWorker(true)}
            >
              Reload
            </button>
          ) : null}
          <button
            class="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            onClick={close}
          >
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
}
