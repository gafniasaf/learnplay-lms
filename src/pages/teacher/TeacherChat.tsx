import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

type ChatMessage = { role: "user" | "assistant"; content: string };

function normalizeStatus(v: unknown): string {
  return String(v || "").toLowerCase().trim();
}

export default function TeacherChat() {
  const mcp = useMCP();

  const [scope, setScope] = useState<"all" | "materials" | "mes">("all");
  const [materialId, setMaterialId] = useState<string>("");

  const [materials, setMaterials] = useState<Array<Record<string, unknown>>>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<string>("");
  const [citations, setCitations] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedMaterial = useMemo(
    () => materials.find((m) => String(m.id || "") === String(materialId || "")) || null,
    [materials, materialId],
  );

  const refreshMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    try {
      const res: any = await mcp.listRecords("library-material", 50);
      if (!res || res.ok !== true) {
        throw new Error("Failed to load materials");
      }
      setMaterials(Array.isArray(res.records) ? res.records : []);
    } catch (e) {
      toast.error("Failed to load materials", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoadingMaterials(false);
    }
  }, [mcp]);

  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

  const canSend = useMemo(() => !!draft.trim() && !sending, [draft, sending]);

  const onClear = () => {
    setMessages([]);
    setDraft("");
    setAnswer("");
    setCitations([]);
    setError(null);
  };

  const onSend = async () => {
    setError(null);
    const text = draft.trim();
    if (!text) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setSending(true);

    try {
      const resp: any = await mcp.teacherChatAssistant({
        messages: nextMessages,
        scope,
        materialId: scope === "materials" ? (materialId || undefined) : undefined,
      });

      if (!resp || resp.ok !== true) {
        const msg = typeof resp?.error?.message === "string"
          ? resp.error.message
          : typeof resp?.error === "string"
            ? resp.error
            : "TeacherGPT chat failed";
        throw new Error(msg);
      }

      const a = typeof resp.answer === "string" ? resp.answer : "";
      setAnswer(a);
      setCitations(Array.isArray(resp.citations) ? resp.citations : []);
      setMessages((prev) => [...prev, { role: "assistant", content: a || "(empty response)" }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("TeacherGPT failed", { description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">TeacherGPT Chat</h1>
          <p className="text-sm text-muted-foreground">
            Ask questions grounded in your ingested Materials and the MES corpus.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onClear}
          data-cta-id="cta-teachergpt-chat-clear"
          data-action="click"
        >
          Clear
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="teachergpt-scope">Scope</Label>
              <select
                id="teachergpt-scope"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={scope}
                onChange={(e) => setScope(normalizeStatus(e.target.value) as any)}
                data-cta-id="cta-teachergpt-chat-scope"
                data-action="select"
              >
                <option value="all">All (Materials + MES)</option>
                <option value="materials">Materials only</option>
                <option value="mes">MES only</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teachergpt-material">
                Material (optional){scope === "materials" ? " — used for retrieval" : ""}
              </Label>
              <div className="flex gap-2">
                <select
                  id="teachergpt-material"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  disabled={loadingMaterials || materials.length === 0}
                  data-cta-id="cta-teachergpt-chat-material-select"
                  data-action="select"
                >
                  <option value="">(All materials)</option>
                  {materials.map((m) => (
                    <option key={String(m.id)} value={String(m.id)}>
                      {String(m.title || m.file_name || m.id)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={refreshMaterials}
                  disabled={loadingMaterials}
                  data-cta-id="cta-teachergpt-chat-material-refresh"
                  data-action="click"
                >
                  {loadingMaterials ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </Button>
              </div>
              {selectedMaterial ? (
                <div className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium">{String(selectedMaterial.title || selectedMaterial.id)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="teachergpt-draft">Your message</Label>
            <div className="flex gap-2">
              <Input
                id="teachergpt-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask a question..."
                data-cta-id="cta-teachergpt-chat-input"
                data-action="edit"
              />
              <Button
                onClick={onSend}
                disabled={!canSend}
                data-cta-id="cta-teachergpt-chat-send"
                data-action="click"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
              </Button>
            </div>
          </div>

          {answer ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-sm whitespace-pre-wrap">{answer}</div>
            </div>
          ) : null}

          {Array.isArray(citations) && citations.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Citations</Badge>
                <span className="text-xs text-muted-foreground">{citations.length} retrieved chunk(s)</span>
              </div>
              <div className="grid gap-2">
                {citations.slice(0, 6).map((c, idx) => (
                  <div key={idx} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {String((c as any).source || "")} · {String((c as any).course_id || "")} · chunk{" "}
                        {String((c as any).item_index ?? "")}
                      </span>
                      <span className="text-muted-foreground">
                        sim {Number((c as any).similarity ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {String((c as any).text || "").slice(0, 240)}
                      {String((c as any).text || "").length > 240 ? "…" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No citations yet. Ask a question after ingesting a Material or indexing the MES corpus.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


