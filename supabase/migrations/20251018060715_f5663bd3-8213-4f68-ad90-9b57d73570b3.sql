-- Function to handle new user signup and create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile with default student role
  INSERT INTO public.profiles (id, role, full_name, created_at)
  VALUES (
    new.id,
    'student',
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    now()
  );
  
  RETURN new;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to auto-create profile for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to make a user an admin (call this after creating your admin user)
CREATE OR REPLACE FUNCTION public.make_user_admin(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Find user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Update or insert admin profile
  INSERT INTO public.profiles (id, role, created_at)
  VALUES (target_user_id, 'admin', now())
  ON CONFLICT (id) 
  DO UPDATE SET role = 'admin';
  
  RAISE NOTICE 'User % is now an admin', user_email;
END;
$$;