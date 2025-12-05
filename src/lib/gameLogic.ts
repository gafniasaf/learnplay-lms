/**
 * Pure game logic functions for adaptive learning system
 * Extracted for testing and reusability
 * 
 * Copied from dawn-react-starter - clean, tested, no workarounds
 */

import type { Course, CourseItem } from "@/lib/types/course";

export type Variant = "1" | "2" | "3";

/**
 * Calculate the next variant in rotation (1 -> 2 -> 3 -> 1)
 * @param current Current variant number
 * @returns Next variant number
 */
export function nextVariant(current: Variant): Variant {
  const num = parseInt(current);
  const next = num >= 3 ? 1 : num + 1;
  return String(next) as Variant;
}

/**
 * Resolve which item to enqueue when user answers incorrectly
 * 
 * Logic:
 * 1. If item has a cluster and variant, try to find next variant in catalog
 * 2. If next variant exists, use it (duplicates allowed)
 * 3. Otherwise, re-enqueue the current item
 * 
 * @param currentItem The item that was answered incorrectly
 * @param pool Current pool of items (not used for duplicate checking)
 * @param catalog Full course catalog
 * @param variantMap Map tracking last used variant per cluster
 * @returns Object with item to enqueue and updated variant to track
 */
export function resolveOnWrong(
  currentItem: CourseItem,
  pool: CourseItem[],
  catalog: Course,
  variantMap: Map<string, number>
): { itemToEnqueue: CourseItem; nextVariantNum?: number } {
  // Default fallback: re-enqueue current item
  let itemToEnqueue = currentItem;
  let nextVariantNum: number | undefined;

  // Cluster rotation logic: find next variant if cluster exists
  const clusterId = currentItem.clusterId;
  
  if (clusterId && currentItem.variant) {
    const currentVariant = parseInt(currentItem.variant) || 1;
    const usedVariant = variantMap.get(clusterId) || currentVariant;
    const next = usedVariant >= 3 ? 1 : usedVariant + 1;

    const nextVariantItem = catalog.items.find(
      (item) =>
        item.clusterId === clusterId &&
        parseInt(item.variant) === next
    );

    // Use next variant if found (duplicates allowed)
    if (nextVariantItem) {
      itemToEnqueue = nextVariantItem;
      nextVariantNum = next;
    }
    // Otherwise: fallback to current item (no nextVariantNum update)
  }

  return { itemToEnqueue, nextVariantNum };
}



