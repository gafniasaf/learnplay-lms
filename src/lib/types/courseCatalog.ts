export interface CourseCatalogItem {
  id: string;
  title: string;
  subject: string;
  gradeBand: string;
  contentVersion: string;
  description: string;
  itemCount: number;
  duration: string;
  difficulty: string;
}

export interface CourseCatalog {
  courses: CourseCatalogItem[];
}
