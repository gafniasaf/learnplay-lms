import React from "react";
import { ENTITY_FIELDS } from "@/lib/contracts";

export default function GenericList() {
  const entityNames = Object.keys(ENTITY_FIELDS || {});
  const primaryEntity = entityNames[0] || "Entity";
  const fields = (ENTITY_FIELDS as any)?.[primaryEntity] || [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Entity List</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Rendering fields for: <span className="font-mono">{primaryEntity}</span>
      </p>
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {fields.map((f: any) => (
                <th key={f.key} className="text-left px-3 py-2 font-medium">
                  {f.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 text-muted-foreground" colSpan={Math.max(fields.length, 1)}>
                No data yet — demo mode
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}



