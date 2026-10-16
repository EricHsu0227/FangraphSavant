const missing=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_D1_DATABASE_ID'].filter(key=>!process.env[key]);
if(missing.length)throw Error('Configure the cloudflare-private GitHub environment before deploying: '+missing.join(', '));
if(!/^[a-f0-9-]{36}$/.test(process.env.CLOUDFLARE_D1_DATABASE_ID))throw Error('D1 configuration is invalid. No deployment attempted.');
console.log('Public Cloudflare deployment configuration is present. Zero Trust is not required; account storage is inaccessible anonymously.');
