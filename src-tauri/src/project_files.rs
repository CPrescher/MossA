use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri_plugin_dialog::DialogExt;

const MAX_PROJECT_BYTES: u64 = 256_000_000;

#[derive(Clone, Default)]
pub struct ProjectFiles(Arc<Mutex<Registry>>);
#[derive(Default)]
struct Registry {
    next: u64,
    paths: HashMap<String, PathBuf>,
}
#[derive(serde::Serialize)]
pub struct Target {
    id: String,
    filename: String,
}
#[derive(serde::Serialize)]
pub struct OpenedProject {
    #[serde(flatten)]
    target: Target,
    contents: String,
}

impl ProjectFiles {
    fn remember(&self, path: PathBuf) -> Result<Target, String> {
        let filename = path
            .file_name()
            .ok_or("Invalid project filename")?
            .to_string_lossy()
            .into_owned();
        let mut registry = self
            .0
            .lock()
            .map_err(|_| "Project file state is unavailable")?;
        registry.next += 1;
        let id = format!("project-file-{}", registry.next);
        registry.paths.insert(id.clone(), path);
        Ok(Target { id, filename })
    }
    fn path(&self, id: &str) -> Result<PathBuf, String> {
        self.0
            .lock()
            .map_err(|_| "Project file state is unavailable")?
            .paths
            .get(id)
            .cloned()
            .ok_or_else(|| {
                "This project file is no longer available. Use Save As to choose a destination."
                    .into()
            })
    }
}

fn write_project(path: &Path, contents: &str) -> Result<(), String> {
    if contents.len() as u64 > MAX_PROJECT_BYTES {
        return Err("Project file is too large (maximum 256 MB).".into());
    }
    let parent = path.parent().ok_or("No destination directory")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if let Ok(metadata) = fs::metadata(path) {
        if metadata.permissions().readonly() {
            return Err(
                "The project file is read-only. Use Save As to choose another destination.".into(),
            );
        }
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|e| e.to_string())?;
    }
    temporary
        .write_all(contents.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_project(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_PROJECT_BYTES {
        return Err("Project file is too large (maximum 256 MB).".into());
    }
    let mut data = Vec::new();
    file.take(MAX_PROJECT_BYTES + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_PROJECT_BYTES {
        return Err("Project file is too large (maximum 256 MB).".into());
    }
    String::from_utf8(data).map_err(|_| "The project file is not valid UTF-8 text.".into())
}

fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Projects can only be opened and saved from the analysis window.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn open_project_file(
    window: tauri::WebviewWindow,
    files: tauri::State<'_, ProjectFiles>,
) -> Result<Option<OpenedProject>, String> {
    main_window(&window)?;
    let files = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = window
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("MossA project", &["mossa", "json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = fs::canonicalize(file.into_path().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let contents = read_project(&path)?;
        Ok(Some(OpenedProject {
            target: files.remember(path)?,
            contents,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_project_file(
    window: tauri::WebviewWindow,
    files: tauri::State<'_, ProjectFiles>,
    target: Option<String>,
    filename: String,
    contents: String,
    save_as: bool,
) -> Result<Option<Target>, String> {
    main_window(&window)?;
    let files = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Only paths selected in a native Open/Save dialog can be overwritten.
        let current = target.as_deref().map(|id| files.path(id)).transpose()?;
        if !save_as {
            if let Some(path) = &current {
                write_project(path, &contents)?;
                return Ok(Some(Target {
                    id: target.unwrap(),
                    filename: path.file_name().unwrap().to_string_lossy().into_owned(),
                }));
            }
        }
        let filename = current
            .as_ref()
            .and_then(|p| p.file_name())
            .or_else(|| Path::new(&filename).file_name())
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled project.mossa");
        let mut dialog = window
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("MossA project", &["mossa"])
            .set_file_name(filename);
        if let Some(parent) = current.as_ref().and_then(|p| p.parent()) {
            dialog = dialog.set_directory(parent);
        }
        let Some(file) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        write_project(&path, &contents)?;
        Ok(Some(files.remember(path)?))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_updates_only_the_selected_file_and_preserves_old_document_targets() {
        let dir = tempfile::tempdir().unwrap();
        let files = ProjectFiles::default();
        let a = dir.path().join("first.mossa");
        let b = dir.path().join("copy.mossa");
        write_project(&a, "Fe³⁺ first").unwrap();
        let first = files.remember(a.clone()).unwrap();
        write_project(&files.path(&first.id).unwrap(), "first edited").unwrap();
        write_project(&b, "copy").unwrap();
        let second = files.remember(b.clone()).unwrap();
        write_project(&files.path(&second.id).unwrap(), "copy edited").unwrap();
        assert_eq!(read_project(&a).unwrap(), "first edited");
        assert_eq!(read_project(&b).unwrap(), "copy edited");
        assert_ne!(first.id, second.id);
        assert!(files.path("/etc/arbitrary-path").is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
    }
    #[test]
    fn failed_write_does_not_replace_the_original_or_leave_temporary_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.mossa");
        write_project(&path, "original").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        assert!(write_project(&path, "replacement").is_err());
        assert_eq!(read_project(&path).unwrap(), "original");
        assert!(write_project(&dir.path().join("missing/project.mossa"), "replacement").is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn project_open_rejects_invalid_text_and_oversized_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("invalid.mossa");
        fs::write(&path, [255]).unwrap();
        assert!(read_project(&path).is_err());
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_PROJECT_BYTES + 1)
            .unwrap();
        assert!(read_project(&path).is_err());
    }
}
