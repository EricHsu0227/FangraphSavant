import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {preferenceRequest} from '../../../lib/account-preferences.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){return preferenceRequest(request,{user:await getChatGPTUser(),db:env.DB});}
export const GET=handle;
export const PUT=handle;
