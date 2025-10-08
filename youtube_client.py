import os
from googleapiclient.discovery import build

YT_API_KEY = os.environ.get('YT_API_KEY')
CHANNEL_ID = os.environ.get('CHANNEL_ID')

youtube = build('youtube', 'v3', developerKey=YT_API_KEY)

def get_channel_stats(channel_id=CHANNEL_ID):
    resp = youtube.channels().list(part='statistics,snippet', id=channel_id).execute()
    items = resp.get('items', [])
    if not items:
        return {}
    item = items[0]
    stats = item.get('statistics', {})
    snippet = item.get('snippet', {})
    return {
        'title': snippet.get('title'),
        'subs': int(stats.get('subscriberCount', 0)),
        'views': int(stats.get('viewCount', 0)),
        'videos': int(stats.get('videoCount', 0))
    }

def list_recent_videos(channel_id=CHANNEL_ID, max_results=10):
    # Obtiene uploads playlist
    resp = youtube.channels().list(part='contentDetails', id=channel_id).execute()
    items = resp.get('items', [])
    if not items:
        return []
    uploads_playlist = items[0]['contentDetails']['relatedPlaylists']['uploads']
    playlist_items = youtube.playlistItems().list(part='snippet', playlistId=uploads_playlist, maxResults=max_results).execute()
    vids = []
    for it in playlist_items.get('items', []):
        sn = it['snippet']
        vids.append({
            'videoId': sn['resourceId']['videoId'],
            'title': sn['title'],
            'publishedAt': sn['publishedAt']
        })
    return vids

def get_video_stats(video_id):
    resp = youtube.videos().list(part='statistics,contentDetails,snippet', id=video_id).execute()
    items = resp.get('items', [])
    if not items:
        return {}
    it = items[0]
    return {
        'title': it['snippet']['title'],
        'views': int(it['statistics'].get('viewCount', 0)),
        'likes': int(it['statistics'].get('likeCount', 0)) if 'likeCount' in it['statistics'] else None,
        'comments': int(it['statistics'].get('commentCount', 0)) if 'commentCount' in it['statistics'] else 0,
        'duration': it['contentDetails']['duration']
    }
