import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculatePasswordStrength, getPasswordStrengthLabel } from "@/lib/utils/passwordStrength";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { redirectTo?: string } | null)?.redirectTo || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Password strength for signup
  const passwordStrength = password.length > 0 ? calculatePasswordStrength(password) : null;

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.is_anonymous) {
        navigate(redirectTo);
      }
    });
  }, [navigate, redirectTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Logged in successfully",
      });

      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${redirectTo}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Account created! You can now log in.",
      });

      // Switch to login tab after successful signup
      const loginTab = document.querySelector('[value="login"]') as HTMLButtonElement;
      loginTab?.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      setResetSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a password reset link",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      // OAuth will redirect, no need for manual navigation
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Google");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-black">LearnPlay</h1>
          </div>
          <CardTitle className="text-2xl text-black">Welcome</CardTitle>
          <CardDescription className="text-black/70">Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="text-black data-[state=active]:text-black">Login</TabsTrigger>
              <TabsTrigger value="signup" className="text-black data-[state=active]:text-black">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-black">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="text-black"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-black">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="text-black"
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-black">{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
              
              <div className="mt-4 text-center">
                <Button 
                  variant="link" 
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-black"
                  type="button"
                >
                  Forgot password?
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-black">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="text-black"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-black">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={6}
                    className="text-black"
                  />
                  
                  {/* Password Strength Indicator */}
                  {passwordStrength && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-black/70">Password strength:</span>
                        <span className={`font-medium ${
                          passwordStrength.strength === 'weak' ? 'text-destructive' :
                          passwordStrength.strength === 'fair' ? 'text-orange-600' :
                          passwordStrength.strength === 'good' ? 'text-primary' :
                          'text-green-600'
                        }`}>
                          {getPasswordStrengthLabel(passwordStrength.strength)}
                        </span>
                      </div>
                      <Progress 
                        value={passwordStrength.score} 
                        className={`h-2 ${
                          passwordStrength.strength === 'weak' ? '[&>div]:bg-destructive' :
                          passwordStrength.strength === 'fair' ? '[&>div]:bg-orange-600' :
                          passwordStrength.strength === 'good' ? '[&>div]:bg-primary' :
                          '[&>div]:bg-green-600'
                        }`}
                      />
                      {passwordStrength.feedback.length > 0 && (
                        <div className="flex items-start gap-1.5 text-xs text-black/70">
                          {passwordStrength.strength === 'strong' ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
                          )}
                          <span>{passwordStrength.feedback[0]}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-black">{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-black/70">Or continue with</span>
            </div>
          </div>

          <div className="grid gap-2">
            <Button
              variant="outline"
              className="w-full text-black"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black">Reset Password</DialogTitle>
            <DialogDescription className="text-black/70">
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          
          {!resetSent ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-black">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="your@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  autoFocus
                  className="text-black"
                />
              </div>
              
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-black">{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="flex flex-col gap-2">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmail("");
                    setResetSent(false);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <Mail className="h-8 w-8 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-green-900 dark:text-green-100">
                    Email sent!
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-200">
                    Check your inbox for the reset link.
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-black/70 text-center">
                Didn't receive it? Check your spam folder or try again.
              </p>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmail("");
                  setResetSent(false);
                }}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
