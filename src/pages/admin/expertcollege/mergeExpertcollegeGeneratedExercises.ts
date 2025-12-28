import type { Course } from "@/lib/types/course";

export type ExpertcollegeSelectedExercise = {
  item: any;
  relatedStudyTextId: string;
};

export type MergeExpertcollegeResult = {
  nextGroups: any[];
  nextItems: any[];
  targetGroupId: number;
  addedCount: number;
};

/**
 * Deterministically append selected generated exercises into a target course.
 * - Creates (or reuses) a group named "Expertcollege Generated"
 * - Appends items with new monotonically increasing numeric IDs
 * - Forces relatedStudyTextIds = [studyTextId]
 */
export function mergeExpertcollegeGeneratedExercises(args: {
  targetCourse: Course | any;
  selected: ExpertcollegeSelectedExercise[];
  groupName?: string;
}): MergeExpertcollegeResult {
  const { targetCourse, selected } = args;
  const groupName = String(args.groupName || "Expertcollege Generated");

  const existingItems: any[] = Array.isArray(targetCourse?.items) ? [...targetCourse.items] : [];
  const existingGroupsRaw: any[] = Array.isArray(targetCourse?.groups) ? [...targetCourse.groups] : [];

  const existingGroup = existingGroupsRaw.find(
    (g) => String(g?.name || "").trim().toLowerCase() === groupName.toLowerCase()
  );
  const maxGroupId = existingGroupsRaw.reduce((m, g) => Math.max(m, Number(g?.id || 0)), 0);
  const targetGroupId = existingGroup ? Number(existingGroup.id) : maxGroupId + 1;

  const nextGroups = existingGroupsRaw
    .map((g) => {
      const gg: any = { ...g };
      // Storage groups should not include nested items.
      if ("items" in gg) delete gg.items;
      return gg;
    })
    .filter(Boolean);

  if (!existingGroup) {
    nextGroups.push({ id: targetGroupId, name: groupName });
  }

  const maxItemId = existingItems.reduce((m, it) => Math.max(m, Number(it?.id || 0)), 0);
  let nextItemId = maxItemId + 1;

  const appended: any[] = selected.map(({ item, relatedStudyTextId }) => {
    const cloned = JSON.parse(JSON.stringify(item));
    cloned.id = nextItemId++;
    cloned.groupId = targetGroupId;
    cloned.relatedStudyTextIds = [relatedStudyTextId];
    return cloned;
  });

  const nextItems = [...existingItems, ...appended];

  return { nextGroups, nextItems, targetGroupId, addedCount: appended.length };
}


