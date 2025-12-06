import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="w-full border-t bg-background">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">LearnPlay</h3>
            <p className="text-sm text-muted-foreground">
              Interactive learning for everyone
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Portals</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/kids" className="text-muted-foreground hover:text-foreground transition-colors">Kids</Link></li>
              <li><Link to="/parent/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Parents</Link></li>
              <li><Link to="/schools" className="text-muted-foreground hover:text-foreground transition-colors">Schools</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/courses" className="text-muted-foreground hover:text-foreground transition-colors">Courses</Link></li>
              <li><Link to="/help" className="text-muted-foreground hover:text-foreground transition-colors">Help</Link></li>
              <li><Link to="/about" className="text-muted-foreground hover:text-foreground transition-colors">About</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacy</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Terms</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          © 2025 LearnPlay. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
