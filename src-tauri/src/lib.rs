use serde_json::{json, Value};

const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WEB_VERSION: &str = "1.20251101.01.00";
const VR_UA: &str = "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

fn web_context() -> Value {
    json!({
        "client": {
            "clientName": "WEB_REMIX",
            "clientVersion": WEB_VERSION,
            "hl": "en",
            "gl": "US"
        }
    })
}

async fn post_innertube(endpoint: &str, body: Value) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("https://music.youtube.com/youtubei/v1/{endpoint}?prettyPrint=false"))
        .header("User-Agent", WEB_UA)
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("X-YouTube-Client-Name", "67")
        .header("X-YouTube-Client-Version", WEB_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("InnerTube {endpoint} HTTP {}", res.status()));
    }
    res.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn yt_browse_home() -> Result<Value, String> {
    let home = post_innertube(
        "browse",
        json!({
            "context": web_context(),
            "browseId": "FEmusic_home"
        }),
    )
    .await?;
    let charts = post_innertube(
        "browse",
        json!({
            "context": web_context(),
            "browseId": "FEmusic_charts"
        }),
    )
    .await
    .ok();
    Ok(json!({ "home": home, "charts": charts }))
}

#[tauri::command]
async fn yt_browse_explore() -> Result<Value, String> {
    let explore = post_innertube(
        "browse",
        json!({
            "context": web_context(),
            "browseId": "FEmusic_explore"
        }),
    )
    .await?;
    let charts = post_innertube(
        "browse",
        json!({
            "context": web_context(),
            "browseId": "FEmusic_charts"
        }),
    )
    .await
    .ok();
    Ok(json!({ "explore": explore, "charts": charts }))
}

#[tauri::command]
async fn yt_search(query: String, params: Option<String>) -> Result<Value, String> {
    let mut body = json!({
        "context": web_context(),
        "query": query
    });
    if let Some(p) = params {
        body["params"] = Value::String(p);
    }
    post_innertube("search", body).await
}

#[tauri::command]
async fn yt_up_next(video_id: String) -> Result<Value, String> {
    post_innertube(
        "next",
        json!({
            "context": web_context(),
            "videoId": video_id,
            "playlistId": format!("RDAMVM{video_id}"),
            "isAudioOnly": true
        }),
    )
    .await
}

#[tauri::command]
async fn yt_resolve_stream(video_id: String) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let body = json!({
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
        "context": {
            "client": {
                "clientName": "ANDROID_VR",
                "clientVersion": "1.61.48",
                "osName": "Android",
                "osVersion": "12L",
                "deviceModel": "Quest 3",
                "hl": "en",
                "gl": "US"
            }
        }
    });
    let res = client
        .post("https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false")
        .header("User-Agent", VR_UA)
        .header("X-YouTube-Client-Name", "28")
        .header("X-YouTube-Client-Version", "1.61.48")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Player HTTP {}", res.status()));
    }
    let root: Value = res.json().await.map_err(|e| e.to_string())?;
    let formats = root["streamingData"]["adaptiveFormats"]
        .as_array()
        .ok_or_else(|| "Missing adaptiveFormats".to_string())?;

    let mut best: Option<(&str, &str, i64, i64)> = None;
    for fmt in formats {
        let mime = fmt["mimeType"].as_str().unwrap_or("");
        if !mime.starts_with("audio/") {
            continue;
        }
        let Some(url) = fmt["url"].as_str() else {
            continue;
        };
        let bitrate = fmt["bitrate"].as_i64().unwrap_or(0);
        let score = bitrate + if mime.contains("mp4") || mime.contains("opus") { 35_000 } else { 0 };
        if best.map_or(true, |b| score > b.3) {
            best = Some((url, mime, bitrate / 1000, score));
        }
    }

    let (url, mime, kbps, _) = best.ok_or_else(|| "No direct audio URL".to_string())?;
    Ok(json!({
        "url": url,
        "mimeType": mime.split(';').next().unwrap_or("audio/webm"),
        "bitrateKbps": kbps.max(64),
        "source": "ANDROID_VR"
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            yt_browse_home,
            yt_browse_explore,
            yt_search,
            yt_up_next,
            yt_resolve_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running ClaudeWaves Desktop");
}
