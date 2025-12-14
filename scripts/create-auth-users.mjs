// Create auth users for parent and child using Supabase Auth admin API
// Required env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
const base = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !serviceKey) {
  console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

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

