import { api } from '../src/hooks/api';
import { Project, Issue } from '../src/lib/contracts';

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000000';

const sampleProjects: Omit<Project, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    organization_id: DEMO_ORG_ID,
    version: 1,
    format: 'v1',
    name: 'Mobile App v2',
    description: 'React Native rewrite of the main app.',
    status: 'active',
    issues: [
      {
        id: 'MOB-101',
        organization_id: DEMO_ORG_ID,
        version: 1,
        format: 'v1',
        title: 'Crash on login screen',
        status: 'todo',
        priority: 'high',
        tags: ['bug', 'critical']
      },
      {
        id: 'MOB-102',
        organization_id: DEMO_ORG_ID,
        version: 1,
        format: 'v1',
        title: 'Implement dark mode toggle',
        status: 'in_progress',
        priority: 'medium',
        assignee: 'AG',
        tags: ['feature', 'ui']
      },
      {
        id: 'MOB-103',
        organization_id: DEMO_ORG_ID,
        version: 1,
        format: 'v1',
        title: 'Update splash screen logo',
        status: 'todo',
        priority: 'low',
        tags: ['design', 'branding']
      },
      {
        id: 'MOB-99',
        organization_id: DEMO_ORG_ID,
        version: 1,
        format: 'v1',
        title: 'Setup repo',
        status: 'done',
        priority: 'medium',
        tags: ['setup']
      }
    ]
  },
  {
    organization_id: DEMO_ORG_ID,
    version: 1,
    format: 'v1',
    name: 'Website Redesign',
    description: 'Marketing site refresh for Q4.',
    status: 'planning',
    issues: [
      {
        id: 'WEB-201',
        organization_id: DEMO_ORG_ID,
        version: 1,
        format: 'v1',
        title: 'Design new homepage layout',
        status: 'todo',
        priority: 'high',
        tags: ['design', 'homepage']
      },
      {
        id: 'WEB-202',
        organization_id: DEMO_ORG_ID,
        version: 1,
        format: 'v1',
        title: 'Optimize images for performance',
        status: 'todo',
        priority: 'medium',
        tags: ['performance', 'optimization']
      }
    ]
  }
];

async function seedDemoProjects() {
  console.log('🌱 Seeding demo projects...');
  
  for (const projectData of sampleProjects) {
    const project: Project = {
      ...projectData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    try {
      await api.saveProject(project);
      console.log(`✅ Created project: ${project.name}`);
    } catch (error) {
      console.error(`❌ Failed to create project ${project.name}:`, error);
    }
  }
  
  console.log('🌱 Demo projects seeded successfully!');
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoProjects().catch(console.error);
}

export { seedDemoProjects };
