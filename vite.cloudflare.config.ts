import vinext from 'vinext';
import {defineConfig} from 'vite';
import {cloudflare} from '@cloudflare/vite-plugin';
export default defineConfig({plugins:[vinext(),cloudflare({
 viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,
 config(config){Object.assign(config,{name:'fangraphsavant',main:'./cloudflare/worker.ts',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],
  workers_dev:true,preview_urls:false,assets:{binding:'ASSETS',run_worker_first:true},
  keep_vars:true,
  d1_databases:[{binding:'DB',database_name:'fangraphsavant-preferences',...(process.env.CLOUDFLARE_D1_DATABASE_ID?{database_id:process.env.CLOUDFLARE_D1_DATABASE_ID}:{}),migrations_dir:'./drizzle'}],
  vars:Object.fromEntries(['ACCESS_TEAM_DOMAIN','ACCESS_AUDIENCE','OWNER_EMAIL'].filter(key=>process.env[key]).map(key=>[key,process.env[key]!]))
 });}
})]});
