import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import type { Device } from "./api";
import { emitSimulatedReading } from "./managed";
import { simulationPaused, pauseSimulation } from "./activeScenario";
export function useRandomReadings(device: Device | undefined) {
  const a = useAuth(),
    cache = useQueryClient();
  const scope = JSON.stringify([
    a.profile?.id,
    device?.id,
    device?.assignment_id,
  ]);
  const [failure, setFailure] = useState({ scope: "", message: "" });
  const [visible, setVisible] = useState(() => !document.hidden);
  const [sharedPaused, setSharedPaused] = useState(false);
  useEffect(() => {
    const sync = () =>
      setSharedPaused(
        device ? simulationPaused(device.id, device.assignment_id) : false,
      );
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("sage-simulation", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sage-simulation", sync);
    };
  }, [device?.id, device?.assignment_id]);
  const active =
    !!device?.enabled &&
    !sharedPaused &&
    !device.requires_esp &&
    device.telemetry_source === "simulated" &&
    device.device_profile_editable === true &&
    visible &&
    !(failure.scope === scope && failure.message);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!active || !device) return;
    const controller = new AbortController();
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        await emitSimulatedReading(
          device!.id,
          device!.assignment_id,
          crypto.randomUUID(),
          controller.signal,
        );
        if (stopped) return;
        void cache.invalidateQueries({ queryKey: ["devices", a.profile!.id] });
        void cache.invalidateQueries({
          queryKey: ["readings", a.profile!.id, device!.id],
        });
        timer = setTimeout(() => void tick(), 3000);
      } catch (error) {
        if (!stopped)
          setFailure({
            scope,
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível atualizar os dados aleatórios.",
          });
      }
    }
    void tick();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [active, device?.id, device?.assignment_id, a.profile?.id, cache, scope]);
  return {
    active,
    visible,
    error: failure.scope === scope ? failure.message : "",
    toggle: () => {
      if (device) pauseSimulation(device.id, device.assignment_id, active);
      if (failure.scope === scope && failure.message) {
        setFailure({ scope: "", message: "" });
      }
    },
  };
}
