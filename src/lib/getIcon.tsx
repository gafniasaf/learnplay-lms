import { 
  Home, BookOpen, Baby, Users, GraduationCap, HelpCircle, Info,
  Mail, Shield, Wrench, BarChart, ClipboardList, UserPlus, Link2,
  Award, Activity, FlaskConical, Sparkles, FileText, CheckCircle,
  Stethoscope, Cpu, Database, Workflow, FolderOpen, Edit, MessageSquare,
  ListChecks, LayoutDashboard, Clock, Target, LucideIcon
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Home,
  BookOpen,
  Baby,
  Users,
  GraduationCap,
  HelpCircle,
  Info,
  Mail,
  Shield,
  Wrench,
  BarChart,
  ClipboardList,
  UserPlus,
  Link2,
  Award,
  Activity,
  FlaskConical,
  Sparkles,
  FileText,
  CheckCircle,
  Stethoscope,
  Cpu,
  Database,
  Workflow,
  FolderOpen,
  Edit,
  MessageSquare,
  ListChecks,
  LayoutDashboard,
  Clock,
  Target,
};

export function getIcon(iconName?: string): LucideIcon | null {
  if (!iconName) return null;
  return iconMap[iconName] || null;
}
