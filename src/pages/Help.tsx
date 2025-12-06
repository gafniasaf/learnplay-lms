import { PageContainer } from "@/components/layout/PageContainer";
import { Play, GraduationCap, Users, Sparkles, Volume2, WifiOff, Mail, Code, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Help = () => {
  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Help Center</h1>
          <p className="text-xl text-muted-foreground">
            Find answers, guides, and support for using the platform.
          </p>
        </div>

      <div className="space-y-12">
        {/* Getting Started */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Play className="h-6 w-6 text-primary" />
            Getting Started
          </h2>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Choose Your Role</h3>
                  <p className="text-muted-foreground">
                    Select your role from the navigation menu to access personalized features:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                    <li><strong>Kids:</strong> Play games and learn</li>
                    <li><strong>Parents:</strong> Track your children's progress</li>
                    <li><strong>Schools:</strong> Manage classes and assignments</li>
                    <li><strong>Admin:</strong> Create and manage courses</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Browse Courses</h3>
                  <p className="text-muted-foreground">
                    Visit the Courses page to see all available learning content. Click any course to start playing immediately.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* For Teachers */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            For Teachers
          </h2>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Creating Assignments</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Go to the Teacher Dashboard</li>
                  <li>Click "Assign Course"</li>
                  <li>Select a course and set a due date (optional)</li>
                  <li>Choose students or classes to assign to</li>
                  <li>Students will see the assignment in their dashboard</li>
                </ol>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Managing Classes</h3>
                <p className="text-muted-foreground mb-2">
                  Create and organize classes to streamline assignment distribution:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Navigate to Classes page</li>
                  <li>Create a new class with a name</li>
                  <li>Invite students via email</li>
                  <li>Assign courses to entire classes at once</li>
                </ul>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Tracking Progress</h3>
                <p className="text-muted-foreground">
                  View detailed analytics on the Analytics page including:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
                  <li>Student performance over time</li>
                  <li>Accuracy trends by course</li>
                  <li>Top performing students</li>
                  <li>Class-wide statistics</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* For Parents */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            For Parents
          </h2>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Linking Your Child</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Ask your child's teacher for a parent linking code</li>
                  <li>Go to Parent Dashboard and click "Link Child"</li>
                  <li>Enter the 6-character code provided by the teacher</li>
                  <li>Once linked, you'll see your child's progress and assignments</li>
                </ol>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Monitoring Progress</h3>
                <p className="text-muted-foreground">
                  Your dashboard shows:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
                  <li>Recent course activity</li>
                  <li>Current assignments and due dates</li>
                  <li>Overall performance statistics</li>
                  <li>Course completion status</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Features */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Platform Features
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  Text-to-Speech
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enable "Read Aloud" during gameplay to hear questions and options spoken. Press ESC to stop speech at any time.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-primary" />
                  Offline Support
                </h3>
                <p className="text-sm text-muted-foreground">
                  Keep playing even without internet. Your progress is saved locally and syncs when you reconnect.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Messaging
                </h3>
                <p className="text-sm text-muted-foreground">
                  Teachers and students can communicate directly through the Messages page for feedback and support.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  Embed Support
                </h3>
                <p className="text-sm text-muted-foreground">
                  Integrate courses into your LMS or website using our embed API with real-time progress tracking.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Developer Resources */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Code className="h-6 w-6 text-primary" />
            Developer Resources
          </h2>
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Integration Guide</h3>
                <p className="text-muted-foreground mb-3">
                  Complete documentation for integrating with the platform, including authentication, roles, embed API, edge endpoints, and caching strategies.
                </p>
                <Link to="/docs/integration" data-cta-id="help-integration-guide">
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    View Integration Guide
                  </Button>
                </Link>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Technical Documentation</h3>
                <p className="text-muted-foreground mb-3">
                  Detailed technical specifications, database schema, API contracts, and development guidelines.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href="/TECHNICAL_DOCUMENTATION.md" target="_blank" rel="noopener noreferrer" data-cta-id="help-tech-docs">
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Technical Docs
                    </Button>
                  </a>
                  <a href="/EMBED_COMMANDS.md" target="_blank" rel="noopener noreferrer" data-cta-id="help-embed-docs">
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Embed Commands
                    </Button>
                  </a>
                  <a href="/SENTRY_SETUP.md" target="_blank" rel="noopener noreferrer" data-cta-id="help-sentry-docs">
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Sentry Setup
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
      </div>
    </PageContainer>
  );
};

export default Help;
