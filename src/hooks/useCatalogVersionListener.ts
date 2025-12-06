import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook to listen for catalog version changes and invalidate React Query cache
 * Triggers re-render of components using catalog data without full page reload
 */
export function useCatalogVersionListener() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleCatalogVersionChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("[useCatalogVersionListener] Catalog version changed, invalidating queries", customEvent.detail);
      
      // Invalidate all queries that depend on the catalog
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      
      // Also invalidate individual course queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["course"] });
    };

    window.addEventListener("catalog-version-changed", handleCatalogVersionChange);

    return () => {
      window.removeEventListener("catalog-version-changed", handleCatalogVersionChange);
    };
  }, [queryClient]);
}
