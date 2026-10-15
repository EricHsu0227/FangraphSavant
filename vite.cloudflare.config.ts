import vinext from 'vinext';
import {defineConfig} from 'vite';
import {cloudflare} from '@cloudflare/vite-plugin';
export default defineConfig({plugins:[vinext(),cloudflare({
 viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,
 config:{name:'fangraphsavant',main:'./cloudflare/worker.ts',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],
  workers_dev:true,preview_urls:false,assets:{binding:'ASSETS',run_worker_first:true},
  d1_databases:[{binding:'DB',database_name:'fangraphsavant-preferences',database_id:process.env.CLOUDFLARE_D1_DATABASE_ID??'00000000-0000-4000-8000-000000000000',migrations_dir:'./drizzle'}],
  vars:{ACCESS_TEAM_DOMAIN:process.env.ACCESS_TEAM_DOMAIN??'',ACCESS_AUDIENCE:process.env.ACCESS_AUDIENCE??'',OWNER_EMAIL:process.env.OWNER_EMAIL??''}
 }
})]});
