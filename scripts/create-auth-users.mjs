// Create auth users for parent and child using Supabase Auth admin API
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0NjM1MCwiZXhwIjoyMDgwNDIyMzUwfQ.A6k908P5YTfg6NdKOx0fsDWpROWTDMfFDtWtn3MEti0";
const base = "https://eidcegehaswbtzrwzvfa.supabase.co";

async function ensureUser(email, password, role) {
  const resp = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    }),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (resp.status === 409) {
    console.log(`${email} already exists`);
    return;
  }
  if (!resp.ok) {
    console.error(`Failed to create ${email}:`, resp.status, data);
    process.exit(1);
  }
  console.log(`Created user ${email}:`, data.id);
}

await ensureUser("parent@example.com", "Temp1234!", "parent");
await ensureUser("child@example.com", "Temp1234!", "student");

