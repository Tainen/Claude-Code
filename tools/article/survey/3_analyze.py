import pandas as pd, sys
pd.set_option('display.width',250)
df=pd.read_pickle(sys.argv[1])
std=df[~df.sheet.str.contains('樽商')].copy()
VAL=['安定した経営基盤のある会社で働きたい','尊敬できる仲間と働きたい','若いうちから稼ぎたい','地元で働きたい','専門スキルを身につけたい','実力主義・競争環境で成長したい']
APP=['企業の安定性・知名度','社長や社員の熱量','評価制度の明確さ（インセンティブなど）','勤務地（地元重視）','研修体制の充実']
def has(s,opt): return s.fillna('').astype(str).str.contains(opt,regex=False)
std['pub']=has(std.industry,'公務員')|has(std.job,'公務員')
std['ind_undec']=has(std.industry,'まだ決まっていない')
std['job_undec']=has(std.job,'まだ決まっていない')
for col,opts in [('value',VAL),('appeal',APP)]:
    s=std[std[col].isin(opts)]
    for by in ['g','sreg']:
        t=pd.crosstab(s[by],s[col],normalize='index').mul(100).round(1)[opts]
        t['n']=s.groupby(by).size()
        print('==',col,'by',by); print(t.to_string())
    tot=s[col].value_counts(normalize=True).mul(100).round(1); print('total',len(s)); print(tot.to_string())
for by in ['g','sreg']:
    t=std.groupby(by).agg(n=('nm','size'),pub=('pub','mean'),ind_undec=('ind_undec','mean'),job_undec=('job_undec','mean'),local=('local',lambda x: x.dropna().astype(float).mean()))
    print('== flags by',by); print((t.assign(**{c:(t[c]*100).round(1) for c in ['pub','ind_undec','job_undec','local']})).to_string())
print('total pub',round(std.pub.mean()*100,1),'local',round(df.local.dropna().astype(float).mean()*100,1),'N std',len(std))
# industries by grade top
ind=std[['g','industry']].dropna().copy(); ind['industry']=ind.industry.astype(str).str.split(r',\s*'); ind=ind.explode('industry')
t=pd.crosstab(ind.industry,ind.g); n=std.groupby('g').size()
print((t.div(n,axis=1)*100).round(1).sort_values(1.0,ascending=False).head(12).to_string())
ind=std[['sreg','industry']].dropna().copy(); ind['industry']=ind.industry.astype(str).str.split(r',\s*'); ind=ind.explode('industry')
t=pd.crosstab(ind.industry,ind.sreg); n=std.groupby('sreg').size()
print((t.div(n,axis=1)*100).round(1).sort_values('東海',ascending=False).head(12).to_string())
