import React from "react";

export default function GenericBoard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Generic Board</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["To Do", "In Progress", "Done"].map((lane) => (
          <div key={lane} className="border rounded p-3">
            <h2 className="text-lg font-medium mb-2">{lane}</h2>
            <div className="text-sm text-muted-foreground">No cards — demo mode</div>
          </div>
        ))}
      </div>
    </div>
  );
}



