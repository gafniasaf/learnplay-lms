import { PageContainer } from "@/components/layout/PageContainer";
import { Sparkles, Heart, Target } from "lucide-react";

const About = () => {
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">About LearnPlay</h1>
          <p className="text-xl text-muted-foreground">
            Making learning fun and accessible for everyone.
          </p>
        </div>

        <div className="space-y-12">
          <section className="rounded-2xl border bg-card p-8">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
              <h2 className="text-2xl font-bold">Our Mission</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              LearnPlay is dedicated to creating engaging, interactive learning experiences
              that inspire curiosity and foster growth. We believe education should be
              accessible, enjoyable, and effective for learners of all ages.
            </p>
          </section>

          <section className="rounded-2xl border bg-card p-8">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="h-8 w-8 text-accent" />
              <h2 className="text-2xl font-bold">Our Values</h2>
            </div>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Put learners first in everything we do</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Foster creativity and critical thinking</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Build inclusive and accessible experiences</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Collaborate with educators and families</span>
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-8">
            <div className="flex items-center gap-3 mb-4">
              <Target className="h-8 w-8 text-primary" />
              <h2 className="text-2xl font-bold">Our Approach</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We combine educational research, game design, and technology to create
              experiences that adapt to each learner's needs. Our platform serves kids,
              parents, and schools with tailored tools and insights.
            </p>
          </section>
        </div>
      </div>
    </PageContainer>
  );
};

export default About;
