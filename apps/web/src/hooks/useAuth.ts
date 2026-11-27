import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, useSessionQuery } from "../lib/api/auth";

export function useAuth() {
  const session = useSessionQuery();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await authApi.logout();
    } catch {
      // Even if the request fails the local state must be cleared.
    } finally {
      queryClient.clear();
      setSigningOut(false);
      navigate("/login", { replace: true });
    }
  }, [navigate, queryClient]);

  return {
    user: session.data?.user ?? null,
    session: session.data ?? null,
    clientId: session.data?.clientId ?? null,
    isLoading: session.isLoading,
    error: session.error,
    signOut,
    signingOut,
  };
}
