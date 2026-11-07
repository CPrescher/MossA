#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io::Write, path::Path};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const BRIDGE: &str = include_str!("../desktop-bridge.js");

#[tauri::command]
async fn save_file(
    window: tauri::WebviewWindow,
    filename: String,
    data: Vec<u8>,
) -> Result<bool, String> {
    // The renderer cannot choose a filesystem path. Only the native dialog can.
    let filename = Path::new(&filename)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("mossa-export")
        .to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = window
            .dialog()
            .file()
            .set_parent(&window)
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        let parent = path.parent().ok_or("No destination directory")?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        temporary.write_all(&data).map_err(|e| e.to_string())?;
        temporary.as_file().sync_all().map_err(|e| e.to_string())?;
        temporary.persist(path).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn focus_main(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Application window is unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

fn document_path(path: &str) -> bool {
    let clean = path.split(['?', '#']).next().unwrap_or("");
    (clean.starts_with("MossA/manual/")
        || matches!(
            clean,
            "LICENSE.txt" | "THIRD_PARTY_NOTICES.txt" | "DESKTOP_NOTICES.txt"
        ))
        && !clean.contains('\\')
        && !clean.contains('%')
        && Path::new(clean)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        && !clean.split('/').any(|s| s == ".." || s == ".")
}

#[tauri::command]
async fn open_document(app: tauri::AppHandle, path: String) -> Result<(), String> {
    if !document_path(&path) {
        return Err("Only bundled documentation can be opened here".into());
    }
    let main = app
        .get_webview_window("main")
        .ok_or("Application window is unavailable")?;
    let mut url = main.url().map_err(|e| e.to_string())?;
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    let url = url.join(&path).map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("documentation") {
        window.navigate(url).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, "documentation", WebviewUrl::External(url))
        .title("MossA — Offline documentation")
        .inner_size(1100.0, 800.0)
        .initialization_script(BRIDGE)
        .on_navigation(local_navigation)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto" | "tel") {
        return Err("Unsupported external link".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn local_navigation(url: &url::Url) -> bool {
    // Dev server only exists in debug builds. Packaged apps serve embedded files.
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
        || (cfg!(debug_assertions)
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(1420))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            save_file,
            focus_main,
            open_document,
            open_external
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("MossA 2 — Mössbauer analysis")
                .inner_size(1440.0, 940.0)
                .min_inner_size(960.0, 640.0)
                .initialization_script(BRIDGE)
                .on_navigation(local_navigation)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not start MossA");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn documentation_routes_stay_inside_the_bundle() {
        for path in [
            "MossA/manual/",
            "MossA/manual/guides/importing-data/#formats",
            "LICENSE.txt",
        ] {
            assert!(document_path(path), "{path}");
        }
        for path in [
            "https://example.com",
            "/etc/passwd",
            "MossA/manual/../../../etc/passwd",
            "MossA/manual/%2e%2e/index.html",
            "MossA/manual/./index.html",
            "MossA/manual/..\\secret",
        ] {
            assert!(!document_path(path), "{path}");
        }
    }
    #[test]
    fn navigation_rejects_remote_pages() {
        assert!(local_navigation(
            &url::Url::parse("tauri://localhost/MossA/manual/").unwrap()
        ));
        for url in [
            "https://example.com",
            "https://tauri.localhost.evil.org",
            "file:///etc/passwd",
            "javascript:alert(1)",
        ] {
            assert!(!local_navigation(&url::Url::parse(url).unwrap()));
        }
    }
}
