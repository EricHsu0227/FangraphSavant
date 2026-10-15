import urllib.request,json,concurrent.futures,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]; cache=ROOT/'.sites-runtime'/'expanded-cache';cache.mkdir(exist_ok=True)
paths={}
for y in range(2021,2027):
 paths[f'{y}-advanced']=f'stats?stats=seasonAdvanced,sabermetrics&group=hitting,pitching&season={y}&sportIds=1&sportId=1&playerPool=ALL&limit=5000&gameType=R'
def get(item):
 k,p=item;file=cache/(k+'.json')
 if file.exists():return k,json.loads(file.read_text())
 try:
  b=urllib.request.urlopen('https://statsapi.mlb.com/api/v1/'+p,timeout=60).read();d=json.loads(b);file.write_bytes(b);print(k,len(b),[(s.get('type',{}).get('displayName'),s.get('group',{}).get('displayName'),len(s.get('splits',[])),s.get('totalSplits')) for s in d.get('stats',[])],flush=True);return k,d
 except Exception as e:print('FAIL',k,str(e),flush=True);return k,{'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as p:raw=dict(p.map(get,paths.items()))
(ROOT/'.sites-runtime/expanded-raw.json').write_text(json.dumps(raw,separators=(',',':')))
