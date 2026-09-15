use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

fn sanitise_file_name(file_name: &str) -> String {
  let cleaned: String = file_name
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' })
    .collect();
  if cleaned.trim_matches('-').is_empty() {
    "clinflow-original.pdf".to_string()
  } else {
    cleaned
  }
}

// Writes a ClinFlow-approved synthetic PDF to a dedicated, scoped temp folder and opens it
// with the OS default viewer. This is the only filesystem write exposed to the frontend:
// it always targets this one subfolder and is used solely for transient human review of
// documents already held in the app's own local ClinFlow cache, never for arbitrary paths.
#[tauri::command]
fn open_clinflow_pdf(app: tauri::AppHandle, bytes: Vec<u8>, file_name: String) -> Result<(), String> {
  let mut dir: PathBuf = app.path().temp_dir().map_err(|e| e.to_string())?;
  dir.push("primovex-clinflow-preview");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

  let mut path = dir;
  path.push(sanitise_file_name(&file_name));
  fs::write(&path, &bytes).map_err(|e| e.to_string())?;

  app
    .opener()
    .open_path(path.to_string_lossy().to_string(), None::<&str>)
    .map_err(|e| e.to_string())?;

  let cleanup_path = path.clone();
  std::thread::spawn(move || {
    std::thread::sleep(std::time::Duration::from_secs(120));
    let _ = fs::remove_file(cleanup_path);
  });

  Ok(())
}

// Reads a practice-owned local-network sensor directly (e.g. a mains-powered
// Shelly thermometer's own built-in web API) — a plain, unauthenticated GET
// to a device sitting on the same WiFi as this desktop PC. This exists
// specifically so cold-chain monitoring never has to depend on a third-party
// cloud subscription: the reading never leaves the practice's own network
// until this app writes it into Firestore itself. Deliberately narrow: GET
// only, http:// only, short timeout, no headers/body passthrough — never a
// general request proxy.
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
#[tauri::command]
async fn fetch_local_device_reading(url: String) -> Result<String, String> {
  if !url.starts_with("http://") {
    return Err("Only http:// local-network URLs are supported.".to_string());
  }
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(5))
    .build()
    .map_err(|e| e.to_string())?;
  let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  if !status.is_success() {
    return Err(format!("Device responded with status {status}"));
  }
  response.text().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      open_clinflow_pdf,
      #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
      fetch_local_device_reading
    ]);

  builder
    .setup(|app| {
      #[cfg(mobile)]
      app.handle().plugin(tauri_plugin_barcode_scanner::init())?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Primovex");
}
