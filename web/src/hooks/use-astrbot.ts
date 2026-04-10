import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useAstrBotHealth() {
  return useQuery({
    queryKey: queryKeys.admin.astrBotHealth(),
    queryFn: () => api.astrBotHealth(),
    staleTime: 10_000,
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

export function useAstrBotCreateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.astrBotCreateBot(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.astrBotBots() });
      qc.invalidateQueries({ queryKey: queryKeys.admin.astrBotHealth() });
    },
  });
}
