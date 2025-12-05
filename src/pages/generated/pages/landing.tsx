import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Target, BarChart3, Bot, ArrowRight, Sparkles } from "lucide-react";

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        
        <div className="relative container mx-auto px-6 py-24 md:py-32">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            {/* Logo */}
            <div className="mb-8 relative">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/30">
                <GraduationCap className="w-12 h-12 text-primary-foreground" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-accent animate-pulse" />
            </div>
            
            {/* Title */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                LearnPlay
              </span>
            </h1>
            
            {/* Tagline */}
            <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl">
              Adaptive learning with multi-role insights — personalized education for students, teachers, and parents.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
                onClick={() => nav("/auth")}
              >
                Get Started
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6 rounded-xl border-2 hover:bg-secondary/50 transition-all"
                onClick={() => nav("/about")}
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why LearnPlay?</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              A comprehensive learning platform designed to adapt to every student's unique journey.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Feature 1 */}
            <Card className="group border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur">
              <CardContent className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Target className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Adaptive Learning</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Questions adjust to each student's level with smart variant rotation, ensuring optimal challenge and growth.
                </p>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="group border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur">
              <CardContent className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-7 h-7 text-accent" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Multi-Role Dashboards</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Students, teachers, and parents each get tailored insights and analytics to track progress effectively.
                </p>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="group border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur">
              <CardContent className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-success/20 to-success/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Bot className="w-7 h-7 text-success" />
                </div>
                <h3 className="text-xl font-semibold mb-3">AI-Powered Content</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Generate courses and assignments with intelligent assistance, making content creation effortless.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Role Cards Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for Everyone</h2>
            <p className="text-muted-foreground text-lg">Choose your role and start your journey</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <button 
              onClick={() => nav("/student/dashboard")}
              className="group p-8 rounded-2xl bg-gradient-to-br from-[hsl(var(--role-kids))] to-[hsl(var(--role-kids)/0.8)] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all text-left"
            >
              <div className="text-4xl mb-4">🎮</div>
              <h3 className="text-2xl font-bold mb-2">Students</h3>
              <p className="opacity-90">Learn through play with adaptive challenges</p>
            </button>
            
            <button 
              onClick={() => nav("/teacher/dashboard")}
              className="group p-8 rounded-2xl bg-gradient-to-br from-[hsl(var(--role-schools))] to-[hsl(var(--role-schools)/0.8)] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all text-left"
            >
              <div className="text-4xl mb-4">📚</div>
              <h3 className="text-2xl font-bold mb-2">Teachers</h3>
              <p className="opacity-90">Create courses and track class progress</p>
            </button>
            
            <button 
              onClick={() => nav("/parent/dashboard")}
              className="group p-8 rounded-2xl bg-gradient-to-br from-[hsl(var(--role-parents))] to-[hsl(var(--role-parents)/0.8)] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all text-left"
            >
              <div className="text-4xl mb-4">👨‍👩‍👧</div>
              <h3 className="text-2xl font-bold mb-2">Parents</h3>
              <p className="opacity-90">Monitor progress and set learning goals</p>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} LearnPlay. Adaptive learning for everyone.</p>
        </div>
      </footer>
    </div>
  );
}
