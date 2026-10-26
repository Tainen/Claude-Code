import pandas as pd, sys, re
df=pd.read_pickle(sys.argv[1])
df['tsd']=pd.to_datetime(df.ts.astype(str),errors='coerce')
df=df[df.tsd.notna()].copy()
df['nm']=df['name'].astype(str).str.replace(r'[\s　]','',regex=True)
df=df[~df.nm.str.contains('テスト|片岡研人|test',case=False)]
df=df.sort_values('tsd').drop_duplicates('nm',keep='last')
def g(x):
    m=re.search(r'([1-4])\s*年',str(x)); return int(m.group(1)) if m else None
df['g']=df.grade.map(g)
PREF=['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄']
REG={'北海道':'北海道','青森':'東北','岩手':'東北','宮城':'東北','秋田':'東北','山形':'東北','福島':'東北','茨城':'関東','栃木':'関東','群馬':'関東','埼玉':'関東','千葉':'関東','東京':'関東','神奈川':'関東','新潟':'甲信越','山梨':'甲信越','長野':'甲信越','富山':'北陸','石川':'北陸','福井':'北陸','岐阜':'東海','静岡':'東海','愛知':'東海','三重':'東海','滋賀':'関西','京都':'関西','大阪':'関西','兵庫':'関西','奈良':'関西','和歌山':'関西','鳥取':'中国','島根':'中国','岡山':'中国','広島':'中国','山口':'中国','徳島':'四国','香川':'四国','愛媛':'四国','高知':'四国','福岡':'九州・沖縄','佐賀':'九州・沖縄','長崎':'九州・沖縄','熊本':'九州・沖縄','大分':'九州・沖縄','宮崎':'九州・沖縄','鹿児島':'九州・沖縄','沖縄':'九州・沖縄'}
def pref(x):
    s=str(x or '')
    for p in PREF:
        if p in s: return p
    if '札幌' in s or '小樽' in s: return '北海道'
    if '名古屋' in s: return '愛知'
    if '関東' in s: return '(関東)'
    if '関西' in s: return '(関西)'
    if '海外' in s: return '(海外)'
    if 'こだわらない' in s or 'どこでも' in s: return '(どこでも)'
    return None
df['opref']=df.origin.map(pref)
df['l1pref']=df.loc1.map(pref)
df['oreg']=df.opref.map(lambda p: REG.get(p) if p else None)
SREG={'三重':'東海','鈴鹿':'東海','中京':'東海','南山':'東海','愛知大学':'東海','北陸':'北陸','関学':'関西','法政':'関東','北海学園':'北海道','樽商':'北海道'}
def sreg(t):
    for k,v in SREG.items():
        if k in t: return v
    return None
df['sreg']=df.sheet.map(sreg)
def local(r):
    o,l=r.opref,r.l1pref
    o=o if isinstance(o,str) else None; l=l if isinstance(l,str) else None
    if not o or not l or o.startswith('('): return None
    if l.startswith('('):
        if l=='(関東)': return REG.get(o)=='関東'
        if l=='(関西)': return REG.get(o)=='関西'
        return False
    return o==l
df['local']=df.apply(local,axis=1)
df.to_pickle(sys.argv[2])
print('N=',len(df))
print(df.g.value_counts(dropna=False).sort_index())
print(df.sreg.value_counts(dropna=False))
print(df.oreg.value_counts(dropna=False))
print(df.local.value_counts(dropna=False))
