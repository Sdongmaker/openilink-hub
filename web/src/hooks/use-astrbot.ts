import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useAstrBotHealth() {
  return useQuery({
    queryKey: queryKeys.admin.astrBotHealth(),
    queryFn: () => api.astrBotHealth(),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useAstrBotBots() {
  return useQuery({
    queryKey: queryKeys.admin.astrBotBots(),
    queryFn: () => api.astrBotListBots().then((d) => d.bots ?? []),
    staleTime: 10_000,
  });
}

export function useAstrBotGroupStatus() {
  return useQuery({
    queryKey: queryKeys.admin.astrBotGroupStatus(),
    queryFn: () => api.astrBotGroupStatus(),
    staleTime: 15_000,
  });
}

export function useAstrBotCreateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.astrBotCreateBot(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.astrBotBots() });
    },
  });
}

export function useAstrBotDeleteBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (platformId: string) => api.astrBotDeleteBot(platformId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.astrBotBots() });
      qc.invalidateQueries({ queryKey: queryKeys.admin.astrBotGroupStatus() });
    },
  });
}

export function useAstrBotSendGroupMessage() {
  return useMutation({
    mutationFn: (text: string) => api.astrBotSendGroupMessage(text),
  });
}
