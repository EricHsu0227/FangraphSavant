"""Build source snapshots from public, official MLB endpoints; no invented records."""
import urllib.request,json,concurrent.futures,pathlib,datetime,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.sites-runtime'/'mlb-cache';CACHE.mkdir(parents=True,exist_ok=True)
paths={}
for year in range(2021,2027):
 for label,stats,group in [('batting','season','hitting'),('pitching','season','pitching'),('expectedBatting','expectedStatistics','hitting'),('expectedPitching','expectedStatistics','pitching')]:
  paths[f'{year}-{label}']=f'stats?stats={stats}&group={group}&season={year}&sportIds=1&sportId=1&playerPool=ALL&limit=5000&gameType=R'
 paths[f'{year}-standings']=f'standings?leagueId=103,104&season={year}&standingsTypes=regularSeason&hydrate=team'
 paths[f'{year}-teams']=f'teams?sportId=1&season={year}'
 paths[f'{year}-postseason']=f'schedule?sportId=1&startDate={year}-09-01&endDate={year}-12-01&gameTypes=F,D,L,W'
def get(kv):
 key,path=kv;file=CACHE/(key+'.json')
 if file.exists():return key,json.loads(file.read_text())
 for attempt in range(3):
  try:
   b=urllib.request.urlopen('https://statsapi.mlb.com/api/v1/'+path,timeout=50).read();data=json.loads(b);file.write_bytes(b);print(key,len(b),flush=True);return key,data
  except Exception as e:
   if attempt==2:print('FAILED',key,str(e),flush=True);return key,{'error':str(e)}
 return key,{}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: raw=dict(pool.map(get,paths.items()))
(ROOT/'lib/data/raw.json').write_text(json.dumps(raw,separators=(',',':')))
print('complete',datetime.datetime.now(datetime.timezone.utc).isoformat(),flush=True)
