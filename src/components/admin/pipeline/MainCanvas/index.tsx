import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from './OverviewTab';
import { PhasesTab } from './PhasesTab';
import { PromptsTab } from './PromptsTab';
import { OutputTab } from './OutputTab';

interface MainCanvasProps {
  jobId: string | null;
}

export function MainCanvas({ jobId }: MainCanvasProps) {
  return (
    <main className="flex-1 bg-gray-50 overflow-y-auto p-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview">
            <OverviewTab jobId={jobId} />
          </TabsContent>

          <TabsContent value="phases">
            <PhasesTab jobId={jobId} />
          </TabsContent>

          <TabsContent value="prompts">
            <PromptsTab />
          </TabsContent>

          <TabsContent value="output">
            <OutputTab />
          </TabsContent>
        </div>
      </Tabs>
    </main>
  );
}
