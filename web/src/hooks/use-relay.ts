import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useRelayMessages() {
  return useInfiniteQuery({
    queryKey: ["admin", "relay-messages"],
    queryFn: ({ pageParam }) => api.relayMessages(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    staleTime: 30_000,
  });
}

export function useRelayMembers() {
  return useQuery({
    queryKey: queryKeys.admin.relayMembers(),
    queryFn: () => api.relayMembers(),
    staleTime: 15_000,
  });
}

export function useRelayStats() {
  return useQuery({
    queryKey: queryKeys.admin.relayStats(),
    queryFn: () => api.relayStats(),
    staleTime: 15_000,
  });
}

export function useRemoveRelayMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (botID: string) => api.removeRelayMember(botID),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.relayMembers() });
      qc.invalidateQueries({ queryKey: queryKeys.admin.relayStats() });
    },
  });
}
