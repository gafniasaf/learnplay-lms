import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

export default function IntegrationGuide() {
  const navigate = useNavigate();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch the Integration Guide markdown
    fetch("/artifacts/Integration_Guide.md")
      .then((res) => res.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load Integration Guide:", err);
        setContent("# Error\n\nFailed to load Integration Guide.");
        setLoading(false);
      });
  }, []);

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/help")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Help
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Integration Guide</h1>
          </div>
        </div>

        <Card>
          <CardContent className="p-8">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-pulse">Loading documentation...</div>
              </div>
            ) : (
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    // Style code blocks
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match;
                      
                      return isInline ? (
                        <code
                          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                          <code className="text-sm font-mono" {...props}>
                            {children}
                          </code>
                        </pre>
                      );
                    },
                    // Style links
                    a: ({ node, children, ...props }) => (
                      <a
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                    // Style tables
                    table: ({ node, children, ...props }) => (
                      <div className="overflow-x-auto my-6">
                        <table className="min-w-full divide-y divide-border" {...props}>
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ node, children, ...props }) => (
                      <th
                        className="px-4 py-2 bg-muted text-left font-semibold"
                        {...props}
                      >
                        {children}
                      </th>
                    ),
                    td: ({ node, children, ...props }) => (
                      <td className="px-4 py-2 border-t border-border" {...props}>
                        {children}
                      </td>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
