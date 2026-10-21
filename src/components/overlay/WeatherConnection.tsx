import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n";
import { worldDataProvider, type WorldDataProvider } from "@/world/privateWorldSession";
import {
  createOpenMeteoWeatherAdapter,
  type OpenMeteoWeatherAdapter,
} from "@/atmosphere/weatherOpenMeteo";
import { useAppStore, type Weather } from "@/state/appStore";

export interface WeatherConnectionProps {
  selectedDate?: string;
  visible?: boolean;
  provider?: WorldDataProvider;
  adapter?: OpenMeteoWeatherAdapter;
}

export function WeatherConnection(props: WeatherConnectionProps) {
  const provider = props.provider ?? worldDataProvider;
  const [owned, setOwned] = useState<OpenMeteoWeatherAdapter | null>(null);
  useEffect(() => {
    if (props.adapter) return;
    const next = createOpenMeteoWeatherAdapter({ provider });
    setOwned(next);
    return () => next.dispose();
  }, [provider, props.adapter]);
  const adapter = props.adapter ?? owned;
  return adapter ? <ConnectedWeather {...props} provider={provider} adapter={adapter} /> : null;
}
function ConnectedWeather({
  selectedDate,
  visible = true,
  provider = worldDataProvider,
  adapter,
}: WeatherConnectionProps & { adapter: OpenMeteoWeatherAdapter }) {
  const t = useT();
  const storeDate = useAppStore((state) => state.selectedDate);
  const realWeatherEnabled = useAppStore((state) => state.realWeatherEnabled);
  const setRealWeatherKind = useAppStore((state) => state.setRealWeatherKind);
  const setRealWeatherEnabled = useAppStore((state) => state.setRealWeatherEnabled);
  const previousDate = useRef<string | undefined>(undefined);
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const binding = provider.getSnapshot();
  const reference = provider.getGeoreference();
  const eligible =
    binding.mode === "private" &&
    binding.georeferenceReady === true &&
    reference !== null &&
    binding.centerConfirmation?.status === "confirmed" &&
    "world" in binding &&
    binding.world.manifest.isSynthetic === true;
  const disabledReason =
    !reference || !binding.georeferenceReady
      ? "missingReference"
      : binding.centerConfirmation?.status !== "confirmed" ||
          !("world" in binding) ||
          binding.world.manifest.isSynthetic !== true
        ? "notVerified"
        : null;
  const effectiveDate = selectedDate ?? storeDate;
  const copy: Record<string, string> = t.weatherConnection;
  const label = (key: string, fallback: string) => copy?.[key] ?? fallback;

  useEffect(() => () => setRealWeatherEnabled(false), [adapter, setRealWeatherEnabled]);
  useEffect(() => {
    if (!visible) {
      adapter.clear();
      setRealWeatherEnabled(false);
    }
  }, [adapter, setRealWeatherEnabled, visible]);
  useEffect(() => {
    if (previousDate.current !== undefined && previousDate.current !== effectiveDate) {
      adapter.clear();
      setRealWeatherEnabled(false);
    }
    previousDate.current = effectiveDate;
  }, [adapter, effectiveDate, setRealWeatherEnabled]);
  useEffect(() => {
    if (state.status === "ready" && state.reading) {
      setRealWeatherKind(state.reading.kind);
      setRealWeatherEnabled(true);
    } else {
      setRealWeatherEnabled(false);
    }
  }, [setRealWeatherEnabled, setRealWeatherKind, state.reading, state.status]);

  if (!visible) return null;
  const request = () => {
    if (!eligible) return;
    adapter.setDisclosureConfirmed(true);
    void adapter.load(effectiveDate);
  };
  const turnOff = () => {
    adapter.clear();
    setRealWeatherEnabled(false);
  };
  const reading = state.status === "ready" || state.status === "stale" ? state.reading : undefined;
  const statusText =
    state.status === "ready" && reading
      ? `${label("live", "Live weather")} · ${t.weather[reading.kind]}`
      : state.status === "stale" && reading
        ? `${label("stale", "Stale weather")} · ${t.weather[reading.kind]}`
        : state.status === "loading"
          ? label("loading", t.realWeather)
          : state.status === "off"
            ? label("off", t.demoWeatherNote)
            : state.status === "offline"
              ? label("offline", "Offline")
              : state.status === "timeout"
                ? label("timeout", "Timed out")
                : state.errorCode === "BLOCKED_MISSING_GEOREFERENCE"
                  ? label("missingReference", t.realWeather)
                  : state.errorCode === "REAL_WORLD_NOT_VERIFIED"
                    ? label("notVerified", t.realWeather)
                    : state.errorCode === "CONSENT_REQUIRED"
                      ? label("consentRequired", t.realWeather)
                      : state.errorCode === "HISTORICAL_OR_FUTURE_NOT_SUPPORTED"
                        ? label("currentOnly", t.realWeather)
                        : label("error", t.realStreet.blocked);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="chip min-h-11"
          disabled={!eligible}
          aria-label={t.realWeather}
          title={disabledReason ? label(disabledReason, t.realWeather) : undefined}
        >
          {t.realWeather}
        </button>
      </Dialog.Trigger>
      <p className="mt-1 text-xs" role="status">
        {eligible ? statusText : label(disabledReason ?? "notVerified", t.realWeather)}
      </p>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 text-foreground shadow-xl">
          <Dialog.Title className="text-lg font-semibold">{t.realWeather}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm">
            {label("disclosure", t.realStreet.disclosure)}
          </Dialog.Description>
          <p className="mt-2 text-xs text-muted-foreground">
            {label("privacy", t.localPreview.openNote)}
          </p>
          <p className="mt-3 text-sm" role="status">
            {statusText}
          </p>
          {reading && (
            <p className="mt-2 text-sm">
              {reading.temperatureC.toFixed(1)}°C · {t.weather[reading.kind]} · {reading.timestamp}{" "}
              (UTC+7)
            </p>
          )}
          <p className="mt-3 text-xs">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="chip min-h-11">
                {t.realStreet.cancel}
              </button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={!eligible || state.status === "loading"}
                className="chip min-h-11 bg-primary text-primary-foreground disabled:opacity-40"
                onClick={request}
              >
                {label("confirm", t.realWeather)}
              </button>
            </Dialog.Close>
            {(realWeatherEnabled || state.consented) && (
              <button type="button" className="chip min-h-11" onClick={turnOff}>
                {label("off", t.demoWeatherNote)}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
