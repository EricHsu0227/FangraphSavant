import {accessConfig} from '../cloudflare/access.mjs';
const missing=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_D1_DATABASE_ID','ACCESS_TEAM_DOMAIN','ACCESS_AUDIENCE','OWNER_EMAIL'].filter(key=>!process.env[key]);
if(missing.length)throw Error('Configure the cloudflare-private GitHub environment before deploying: '+missing.join(', '));
if(!accessConfig(process.env)||!/^[a-f0-9-]{36}$/.test(process.env.CLOUDFLARE_D1_DATABASE_ID))throw Error('Cloudflare Access or D1 configuration is invalid. No deployment attempted.');
console.log('Private deployment configuration is present. Worker verifies the Access JWT and owner email on every request.');
