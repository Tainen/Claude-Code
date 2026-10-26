import openpyxl, re, sys, json
import pandas as pd
path=sys.argv[1]
wb=openpyxl.load_workbook(path,read_only=True)
def key(h):
    h=str(h or '')
    if '学年' in h: return 'grade'
    if '出身地' in h: return 'origin'
    if '第1希望' in h: return 'loc1'
    if '第2希望' in h and 'loc2' : return 'loc2'
    if '強み' in h: return 'strength'
    if '価値観' in h: return 'value'
    if '業界' in h: return 'industry'
    if '職種' in h: return 'job'
    if '魅力' in h: return 'appeal'
    if '企業名' in h: return 'company'
    if '部活' in h: return 'club'
    if '大学名' in h: return 'univ'
    if 'タイムスタンプ' in h: return 'ts'
    if '氏名' in h: return 'name'
    if '性別' in h: return 'sex'
    return None
rows=[]
for ws in wb.worksheets:
    it=ws.iter_rows(values_only=True)
    hdr=next(it,None)
    if not hdr: continue
    if ws.title=='シート2':  # ヘッダーなしの別形式（重複の可能性）
        continue
    keys=[]
    seen=set()
    for h in hdr:
        k=key(h)
        if k in seen: k=k+'_2' if k else None
        seen.add(k); keys.append(k)
    for r in it:
        if not any(c not in (None,'') for c in r): continue
        d={'sheet':ws.title}
        for k,v in zip(keys,r):
            if k: d[k]=v
        rows.append(d)
df=pd.DataFrame(rows)
df.to_pickle(sys.argv[2])
print(len(df)); print(df.groupby('sheet').size())
