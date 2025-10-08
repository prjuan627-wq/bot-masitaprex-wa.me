from pytrends.request import TrendReq

pt = TrendReq(hl='es-ES', tz=0)

def top_related_queries(keyword, timeframe='now 7-d'):
    try:
        pt.build_payload([keyword], cat=0, timeframe=timeframe, geo='', gprop='')
        related = pt.related_queries()
        return related.get(keyword, {})
    except Exception as e:
        print('pytrends error', e)
        return {}

def trending_for_keywords(keywords, timeframe='now 7-d'):
    results = {}
    for kw in keywords:
        results[kw] = top_related_queries(kw, timeframe)
    return results
