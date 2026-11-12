import { useLayoutEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { listReadings, type Device } from "./api";
import {
  mergeReadingPage,
  clearTelemetryScope,
  createReadingStream,
  reconcileTelemetryScope,
  shareAuthorization,
  type ReadingPage,
} from "./realtime";

export function useTelemetry(device: Device | undefined, page: number) {
  const a = useAuth(),
    cache = useQueryClient();
  const [channel, setChannel] = useState({ scope: "", state: "connecting" });
  const id = device?.id,
    subject = device?.person_id,
    assignment = device?.assignment_id;
  const userId = a.profile?.id;
  const scope = useMemo(
    () =>
      id && assignment
        ? {
            deviceId: id,
            personId: subject ?? null,
            assignmentId: assignment,
          }
        : undefined,
    [id, subject, assignment],
  );
  const scopeKey = JSON.stringify([userId, id, subject, assignment]);
  const channelState =
    channel.scope === scopeKey ? channel.state : "connecting";
  const stream = useMemo(
    () => (scope ? createReadingStream(scope) : null),
    [scope, userId],
  );
  useLayoutEffect(() => {
    if (!userId) return;
    reconcileTelemetryScope(cache, userId, scope);
    return () => {
      if (scope) clearTelemetryScope(cache, userId, scope.deviceId, scope);
    };
  }, [cache, userId, scope]);
  const readings = useQuery<ReadingPage>({
    queryKey: ["readings", userId, id, subject, assignment, page],
    enabled: !!userId && !!id && !!assignment && channelState !== "denied",
    queryFn: ({ signal }) => {
      const fetchPage = () =>
        listReadings(id!, page, signal, subject, {}, assignment);
      return page === 0 && stream
        ? stream.read(fetchPage, signal)
        : fetchPage();
    },
    refetchInterval:
      channelState === "connected" || channelState === "denied" ? false : 15000,
  });
  useLayoutEffect(() => {
    if (!id || !userId || !assignment) return;
    const client = db();
    let active = true,
      blocked = false;
    const setChannelState = (state: string) =>
      setChannel({ scope: scopeKey, state });
    setChannelState("connecting");
    const clearScope = () => {
      clearTelemetryScope(cache, userId, id);
    };
    const deny = () => {
      if (!active || blocked) return;
      blocked = true;
      clearScope();
      cache.setQueriesData<{ rows: Device[]; count: number }>(
        { queryKey: ["devices", userId] },
        (previous) => {
          if (!previous) return previous;
          const rows = previous.rows.filter((row) => row.id !== id);
          return {
            rows,
            count: Math.max(
              0,
              previous.count - (previous.rows.length - rows.length),
            ),
          };
        },
      );
      setChannelState("denied");
      void client.removeChannel(channel);
      void cache.invalidateQueries({ queryKey: ["devices", userId] });
    };
    const authorize = shareAuthorization(async () => {
      if (!active || blocked) return false;
      try {
        const { data, error } = await client
          .from("devices")
          .select("id,person_id,assignment_id")
          .eq("id", id)
          .maybeSingle();
        if (!active || blocked) return false;
        if (
          error ||
          !data ||
          data.person_id !== subject ||
          data.assignment_id !== assignment
        ) {
          deny();
          return false;
        }
        void cache.invalidateQueries({ queryKey: ["devices", userId] });
        return true;
      } catch {
        deny();
        return false;
      }
    });
    const channel = client
      .channel(`device-${id}-${assignment}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telemetry",
          filter: `device_id=eq.${id}`,
        },
        (change) => {
          if (!active || blocked) return;
          const row = change.new;
          if (
            row.device_id !== id ||
            row.person_id !== subject ||
            row.assignment_id !== assignment
          )
            return;
          stream?.push(row);
          void cache.invalidateQueries({ queryKey: ["devices", userId] });
          cache.setQueryData<ReadingPage>(
            ["readings", userId, id, subject, assignment, 0],
            (previous) =>
              mergeReadingPage(previous, row, {
                deviceId: id,
                personId: subject ?? null,
                assignmentId: assignment,
              }),
          );
          if (row.event)
            void cache.invalidateQueries({ queryKey: ["alerts", userId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `id=eq.${id}`,
        },
        (change) => {
          if (!active || blocked || change.new.id !== id) return;
          if (
            change.new.assignment_id !== assignment ||
            change.new.person_id !== subject
          )
            deny();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "caregiver_device_links",
          filter: `device_id=eq.${id}`,
        },
        () => {
          if (active && !blocked) void authorize();
        },
      )
      .subscribe((status) => {
        if (!active || blocked) return;
        setChannelState(status === "SUBSCRIBED" ? "connected" : "reconnecting");
        if (status === "SUBSCRIBED")
          void authorize().then((allowed) => {
            if (allowed && active && !blocked) {
              void cache.invalidateQueries({
                queryKey: ["readings", userId, id, subject, assignment],
              });
              void cache.invalidateQueries({
                queryKey: ["alerts", userId, id],
              });
            }
          });
      });
    const timer = setInterval(() => void authorize(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [id, subject, assignment, userId, cache, scopeKey, stream]);
  return { readings, channelState };
}
