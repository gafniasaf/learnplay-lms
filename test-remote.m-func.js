
const url = "https://czfrcxenexpeoofuynvp.supabase.co/functions/v1/enqueue-job";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZnJjeGVuZXhwZW9vZnV5bnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNjUzNDMsImV4cCI6MjA3OTY0MTM0M30.qi2YXm-2ad-kuJLNaWAtvBn8GUI8cGAsGOfCbI_toaA";

async function test() {
  console.log("Testing:", url);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ jobType: "ping", payload: {} })
    });
    console.log("Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Body:", text.slice(0, 200));
  } catch (e) {
    console.error("Error:", e);
  }
}

test();


