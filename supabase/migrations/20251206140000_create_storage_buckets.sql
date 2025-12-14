-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('mockups', 'mockups', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('releases', 'releases', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for mockups
CREATE POLICY "Public Access" ON storage.objects FOR SELECT
USING ( bucket_id = 'mockups' );

CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'mockups' AND auth.role() = 'authenticated' );

-- Set up security policies for releases
CREATE POLICY "Public Read Releases" ON storage.objects FOR SELECT
USING ( bucket_id = 'releases' );

CREATE POLICY "Service Role Manage Releases" ON storage.objects
USING ( bucket_id = 'releases' AND auth.role() = 'service_role' )
WITH CHECK ( bucket_id = 'releases' AND auth.role() = 'service_role' );


