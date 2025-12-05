
import React from "react";
import { useNavigate } from "react-router-dom";

export default function About() {
  const nav = useNavigate();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="mb-8">
        <button 
          data-cta-id="back-home" 
          data-action="navigate" 
          data-target="/" 
          className="text-blue-600 hover:text-blue-800 mb-4 inline-flex items-center"
          onClick={() => nav("/")}
          type="button"
        >
          ← Back to Home
        </button>
        <h1 className="text-4xl font-bold">🎓 About LearnPlay</h1>
      </header>

      <main className="space-y-12">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            LearnPlay is an adaptive learning platform designed to help K-12 students master concepts at their own pace. 
            We believe every student learns differently, and our AI-powered system adjusts to each learner's unique needs.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">How It Works</h2>
          <div className="space-y-6">
            <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
              <span className="text-3xl">🎯</span>
              <div>
                <h3 className="font-semibold text-lg">Adaptive Questions</h3>
                <p className="text-gray-600">Our variant rotation system ensures students see different versions of questions when they struggle, helping them learn from multiple angles.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
              <span className="text-3xl">📊</span>
              <div>
                <h3 className="font-semibold text-lg">Progress Tracking</h3>
                <p className="text-gray-600">Students, teachers, and parents each get tailored dashboards showing exactly what matters to them.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
              <span className="text-3xl">🤖</span>
              <div>
                <h3 className="font-semibold text-lg">AI-Powered Content</h3>
                <p className="text-gray-600">Teachers can generate assignments and courses with intelligent AI assistance, saving hours of preparation time.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
              <span className="text-3xl">🎮</span>
              <div>
                <h3 className="font-semibold text-lg">Gamified Learning</h3>
                <p className="text-gray-600">Weekly goals, streaks, and achievements keep students motivated and engaged.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">For Everyone</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 border rounded-lg text-center">
              <h3 className="font-semibold text-lg mb-2">👨‍🎓 Students</h3>
              <p className="text-gray-600 text-sm">Practice at your own pace with adaptive questions that match your skill level.</p>
            </div>
            <div className="p-6 border rounded-lg text-center">
              <h3 className="font-semibold text-lg mb-2">👩‍🏫 Teachers</h3>
              <p className="text-gray-600 text-sm">Create assignments, track class progress, and use AI to generate content.</p>
            </div>
            <div className="p-6 border rounded-lg text-center">
              <h3 className="font-semibold text-lg mb-2">👨‍👩‍👧 Parents</h3>
              <p className="text-gray-600 text-sm">Stay informed about your child's learning progress with weekly summaries.</p>
            </div>
          </div>
        </section>

        <section className="text-center py-8">
          <h2 className="text-2xl font-semibold mb-6">Ready to Start?</h2>
          <button 
            data-cta-id="get-started" 
            data-action="navigate" 
            data-target="/auth" 
            className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
            onClick={() => nav("/auth")}
            type="button"
          >
            Get Started Free
          </button>
        </section>
      </main>
    </div>
  );
}

