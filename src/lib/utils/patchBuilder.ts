/**
 * JSON Patch Builder
 * Generates RFC 6902 JSON Patch operations from object diffs
 */

export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

/**
 * Build JSON Patch operations from original and updated objects
 */
export function buildPatch(original: any, updated: any, basePath = ''): PatchOperation[] {
  const patches: PatchOperation[] = [];

  // Deep comparison
  const originalKeys = Object.keys(original || {});
  const updatedKeys = Object.keys(updated || {});

  // Check for removed keys
  for (const key of originalKeys) {
    if (!(key in updated)) {
      patches.push({
        op: 'remove',
        path: `${basePath}/${key}`,
      });
    }
  }

  // Check for added or changed keys
  for (const key of updatedKeys) {
    const originalValue = original?.[key];
    const updatedValue = updated[key];
    const path = `${basePath}/${key}`;

    // Key doesn't exist in original - add operation
    if (!(key in original)) {
      patches.push({
        op: 'add',
        path,
        value: updatedValue,
      });
      continue;
    }

    // Both are objects (not arrays) - recurse
    if (
      isPlainObject(originalValue) &&
      isPlainObject(updatedValue) &&
      !Array.isArray(originalValue) &&
      !Array.isArray(updatedValue)
    ) {
      patches.push(...buildPatch(originalValue, updatedValue, path));
      continue;
    }

    // Arrays - compare element by element
    if (Array.isArray(originalValue) && Array.isArray(updatedValue)) {
      const maxLength = Math.max(originalValue.length, updatedValue.length);
      
      for (let i = 0; i < maxLength; i++) {
        const origItem = originalValue[i];
        const updItem = updatedValue[i];

        if (i >= updatedValue.length) {
          // Item removed from array
          patches.push({
            op: 'remove',
            path: `${path}/${i}`,
          });
        } else if (i >= originalValue.length) {
          // Item added to array
          patches.push({
            op: 'add',
            path: `${path}/${i}`,
            value: updItem,
          });
        } else if (JSON.stringify(origItem) !== JSON.stringify(updItem)) {
          // Item changed
          if (isPlainObject(origItem) && isPlainObject(updItem)) {
            patches.push(...buildPatch(origItem, updItem, `${path}/${i}`));
          } else {
            patches.push({
              op: 'replace',
              path: `${path}/${i}`,
              value: updItem,
            });
          }
        }
      }
      continue;
    }

    // Primitive value changed or type mismatch
    if (JSON.stringify(originalValue) !== JSON.stringify(updatedValue)) {
      patches.push({
        op: 'replace',
        path,
        value: updatedValue,
      });
    }
  }

  return patches;
}

function isPlainObject(value: any): boolean {
  return value !== null && typeof value === 'object' && value.constructor === Object;
}

