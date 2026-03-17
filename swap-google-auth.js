// swap-google-auth.js
// npm run edScope or npm run itaiScope

// 1. Automatically parse the project ref
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_REF = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : null;

// 2. Load your personal access token 
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// 3. Map your specific scopes from the .env file 
const SCOPES = {
  edScope: {
    clientId: process.env.ED_CLIENT,
    clientSecret: process.env.ED_SECRET,
  },
  itaiScope: {
    clientId: process.env.ITAI_CLIENT,
    clientSecret: process.env.ITAI_SECRET,
  }
};

async function swapGoogleCredentials(scopeName) {
  if (!PROJECT_REF || !ACCESS_TOKEN) {
    console.error('❌ Missing PROJECT_REF or SUPABASE_ACCESS_TOKEN. Check your .env file.');
    return;
  }

  const targetScope = SCOPES[scopeName];

  if (!targetScope || !targetScope.clientId || !targetScope.clientSecret) {
    console.error(`❌ Scope "${scopeName}" not found or missing credentials in .env.`);
    return;
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

  console.log(`Swapping Google Auth to: ${scopeName}...`);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        external_google_enabled: true,
        external_google_client_id: targetScope.clientId,
        external_google_secret: targetScope.clientSecret
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    console.log(`✅ Successfully updated Supabase project to use ${scopeName} credentials.`);
  } catch (error) {
    console.error('❌ Failed to swap credentials:', error.message);
  }
}

// Run the swap based on terminal arguments
const target = process.argv[2];

if (!target) {
  console.log('Please provide a scope to swap to. Example: node --env-file=.env swap-google-auth.js edScope');
} else {
  swapGoogleCredentials(target);
}