use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
#[cfg(desktop)]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use tauri::{Emitter, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, AtomicU32};
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

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
// with the OS default viewer. This write always targets this one subfolder and is used solely
// for transient human review of documents already held in the app's own local ClinFlow cache,
// never for arbitrary paths. (The only other write is save_docman_pdf below, which can only
// reach the two folders the person chose with the system folder picker.)
#[tauri::command]
fn open_clinflow_pdf(app: tauri::AppHandle, bytes: Vec<u8>, file_name: String) -> Result<(), String> {
  write_and_open_pdf(&app, &bytes, &file_name)
}

// The two Docman upload folders: "nfw" (letters needing no action) and "action". The person chooses each with the system folder picker and the choice is kept in this
// computer's app settings. The web page never names a folder: it can only say "nfw", "action" or "incoming", so it cannot make the app write anywhere else.
#[cfg(desktop)]
fn docman_folders_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("docman-folders.json"))
}

#[cfg(desktop)]
fn read_docman_folders(app: &tauri::AppHandle) -> serde_json::Value {
  let saved = docman_folders_file(app).ok()
    .and_then(|file| fs::read_to_string(file).ok())
    .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
  match saved {
    Some(value) if value.is_object() => value,
    _ => serde_json::json!({}),
  }
}

#[cfg(desktop)]
#[tauri::command]
fn docman_folders(app: tauri::AppHandle) -> serde_json::Value {
  let saved = read_docman_folders(&app);
  serde_json::json!({ "nfw": saved["nfw"].as_str().unwrap_or(""), "action": saved["action"].as_str().unwrap_or(""), "incoming": saved["incoming"].as_str().unwrap_or("") })
}

// Async so the picker is not opened from the main thread. Resolves the chosen folder, or nothing if the person cancelled.
#[cfg(desktop)]
#[tauri::command]
async fn choose_docman_folder(app: tauri::AppHandle, kind: String, title: String) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  if kind != "nfw" && kind != "action" && kind != "incoming" {
    return Err("That is not one of the Docman folders.".to_string());
  }
  let Some(picked) = app.dialog().file().set_title(title).blocking_pick_folder() else { return Ok(None) };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  let chosen = path.to_string_lossy().to_string();
  let mut saved = read_docman_folders(&app);
  saved[kind.as_str()] = serde_json::Value::String(chosen.clone());
  let text = serde_json::to_string_pretty(&saved).map_err(|e| e.to_string())?;
  fs::write(docman_folders_file(&app)?, text).map_err(|e| e.to_string())?;
  Ok(Some(chosen))
}

// Saves a Docman PDF into the chosen folder for "nfw" or "action". Only a PDF, a plain file name (no folders in it), a size cap, and it never overwrites: a second
// letter with the same name is saved as "name (2).pdf". Resolves the full path it was saved to.
#[cfg(desktop)]
#[tauri::command]
fn save_docman_pdf(app: tauri::AppHandle, kind: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
  use std::io::Write;
  if kind != "nfw" && kind != "action" {
    return Err("That is not one of the Docman folders.".to_string());
  }
  let saved = read_docman_folders(&app);
  let folder = saved[kind.as_str()].as_str().unwrap_or("");
  if folder.is_empty() {
    return Err("Choose this folder first.".to_string());
  }
  let dir = PathBuf::from(folder);
  if !dir.is_dir() {
    return Err("That folder cannot be found. Choose it again.".to_string());
  }
  if bytes.len() < 5 || &bytes[..5] != b"%PDF-" {
    return Err("Only a PDF can be saved here.".to_string());
  }
  if bytes.len() > 25 * 1024 * 1024 {
    return Err("That PDF is too large to save.".to_string());
  }
  let mut stem: String = file_name.chars().take(120)
    .map(|c| if c.is_alphanumeric() || " -_().,&".contains(c) { c } else { '_' })
    .collect();
  if stem.len() >= 4 && stem.is_char_boundary(stem.len() - 4) && stem[stem.len() - 4..].eq_ignore_ascii_case(".pdf") {
    stem.truncate(stem.len() - 4);
  }
  let stem = stem.trim_matches(|c: char| c == '.' || c == ' ').to_string();
  let stem = if stem.is_empty() { "letter".to_string() } else { stem };
  for attempt in 1..=200u32 {
    let name = if attempt == 1 { format!("{stem}.pdf") } else { format!("{stem} ({attempt}).pdf") };
    let target = dir.join(&name);
    match fs::OpenOptions::new().write(true).create_new(true).open(&target) {
      Ok(mut file) => {
        file.write_all(&bytes).map_err(|e| format!("The PDF could not be saved: {e}"))?;
        return Ok(target.to_string_lossy().to_string());
      }
      Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
      Err(e) => return Err(format!("The PDF could not be saved there: {e}")),
    }
  }
  Err("Too many files with that name are already in the folder.".to_string())
}

// The Incoming scans folder: where the practice's scanners save letters for ClinFlow to read in the background. The person chooses it once with the system folder picker
// (kind "incoming", kept with the two Docman folders). The web page can only name a file in it by its bare name, never a path, so it cannot reach anywhere else. ClinFlow never
// deletes a scan: a finished one is moved into "ClinFlow done" and one it could not read into "ClinFlow problems", both inside the Incoming folder.
#[cfg(desktop)]
fn incoming_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let saved = read_docman_folders(app);
  let folder = saved["incoming"].as_str().unwrap_or("");
  if folder.is_empty() {
    return Err("Choose the Incoming scans folder first.".to_string());
  }
  let dir = PathBuf::from(folder);
  if !dir.is_dir() {
    return Err("The Incoming scans folder cannot be found. Choose it again.".to_string());
  }
  Ok(dir)
}

// A bare PDF file name: no folders, no "..", at most 200 characters.
#[cfg(desktop)]
fn bare_pdf_name(name: &str) -> Result<String, String> {
  let ok = !name.is_empty()
    && name.chars().count() <= 200
    && !name.contains('/')
    && !name.contains('\\')
    && !name.contains("..")
    && name.to_ascii_lowercase().ends_with(".pdf");
  if ok { Ok(name.to_string()) } else { Err("That is not a PDF in the Incoming scans folder.".to_string()) }
}

// The PDFs waiting in the Incoming folder itself (not the "done" and "problems" folders inside it), oldest first: [{ name, size, modifiedMs }].
#[cfg(desktop)]
#[tauri::command]
fn list_incoming_scans(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
  let dir = incoming_dir(&app)?;
  let mut found: Vec<(u128, serde_json::Value)> = Vec::new();
  for entry in fs::read_dir(&dir).map_err(|e| format!("The Incoming scans folder could not be read: {e}"))?.flatten() {
    let Ok(meta) = entry.metadata() else { continue };
    let name = entry.file_name().to_string_lossy().to_string();
    if !meta.is_file() || bare_pdf_name(&name).is_err() {
      continue;
    }
    let modified = meta.modified().ok()
      .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
      .map(|d| d.as_millis())
      .unwrap_or(0);
    found.push((modified, serde_json::json!({ "name": name, "size": meta.len(), "modifiedMs": modified as u64 })));
  }
  found.sort_by_key(|(modified, _)| *modified);
  Ok(found.into_iter().map(|(_, value)| value).collect())
}

// The bytes of one waiting scan. Only a PDF, and no more than 25 MB.
#[cfg(desktop)]
#[tauri::command]
fn read_incoming_scan(app: tauri::AppHandle, name: String) -> Result<Vec<u8>, String> {
  let path = incoming_dir(&app)?.join(bare_pdf_name(&name)?);
  let meta = fs::metadata(&path).map_err(|_| "That scan is no longer in the Incoming scans folder.".to_string())?;
  if !meta.is_file() || meta.len() > 25 * 1024 * 1024 {
    return Err("That scan is too large to read (the limit is 25 MB).".to_string());
  }
  let bytes = fs::read(&path).map_err(|e| format!("That scan could not be read: {e}"))?;
  if bytes.len() < 5 || &bytes[..5] != b"%PDF-" {
    return Err("That file is not a PDF.".to_string());
  }
  Ok(bytes)
}

// Moves a scan out of the way once ClinFlow has dealt with it: outcome "done" or "problem". Never overwrites and never deletes; resolves where it went.
#[cfg(desktop)]
#[tauri::command]
fn finish_incoming_scan(app: tauri::AppHandle, name: String, outcome: String) -> Result<String, String> {
  let dir = incoming_dir(&app)?;
  let from = dir.join(bare_pdf_name(&name)?);
  if !from.is_file() {
    return Err("That scan is no longer in the Incoming scans folder.".to_string());
  }
  let sub = match outcome.as_str() {
    "done" => "ClinFlow done",
    "problem" => "ClinFlow problems",
    _ => return Err("That is not a way to finish a scan.".to_string()),
  };
  let target_dir = dir.join(sub);
  fs::create_dir_all(&target_dir).map_err(|e| format!("The {sub} folder could not be made: {e}"))?;
  let stem = name[..name.len() - 4].to_string();
  for attempt in 1..=200u32 {
    let file = if attempt == 1 { format!("{stem}.pdf") } else { format!("{stem} ({attempt}).pdf") };
    let target = target_dir.join(&file);
    if target.exists() {
      continue;
    }
    fs::rename(&from, &target).map_err(|e| format!("The scan could not be moved: {e}"))?;
    return Ok(target.to_string_lossy().to_string());
  }
  Err("Too many files with that name are already in the folder.".to_string())
}

// Downloads a practice document (a COSHH sheet, a certificate, a waste consignment note) from the practice's own Firebase
// Storage and opens it in the system PDF viewer. The download is done here, not in the web page: the page would need the
// storage bucket to allow cross-origin downloads, and it does not, so opening a PDF from there silently did nothing.
// Deliberately narrow: https://firebasestorage.googleapis.com only, a size cap, and the bytes must be a PDF.
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
#[tauri::command]
async fn open_storage_pdf(app: tauri::AppHandle, url: String, file_name: String) -> Result<(), String> {
  if !url.starts_with("https://firebasestorage.googleapis.com/") {
    return Err("Only documents held in the practice's own storage can be opened.".to_string());
  }
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(45))
    .build()
    .map_err(|e| e.to_string())?;
  let response = client.get(&url).send().await.map_err(|e| format!("The document could not be fetched: {e}"))?;
  let status = response.status();
  if !status.is_success() {
    return Err(format!("The document store answered {status}."));
  }
  let bytes = response.bytes().await.map_err(|e| format!("The document could not be read: {e}"))?;
  if bytes.len() > 25 * 1024 * 1024 {
    return Err("That document is too large to open here.".to_string());
  }
  if !bytes.starts_with(b"%PDF") {
    return Err("That file is not a PDF.".to_string());
  }
  write_and_open_pdf(&app, &bytes, &file_name)
}

fn write_and_open_pdf(app: &tauri::AppHandle, bytes: &[u8], file_name: &str) -> Result<(), String> {
  let mut dir: PathBuf = app.path().temp_dir().map_err(|e| e.to_string())?;
  dir.push("primovex-clinflow-preview");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

  let mut path = dir;
  path.push(sanitise_file_name(file_name));
  fs::write(&path, bytes).map_err(|e| e.to_string())?;

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
    .timeout(std::time::Duration::from_secs(8))
    .build()
    .map_err(|e| e.to_string())?;
  let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  if !status.is_success() {
    return Err(format!("Device responded with status {status}"));
  }
  response.text().await.map_err(|e| e.to_string())
}

// The address to show someone setting up a battery Shelly's wake webhook (see
// start_shelly_wake_listener below) - the practice IP this PC is reachable on
// from the rest of the local network. A UDP "connect" never actually sends a
// packet; it only asks the OS which local interface/address it would use to
// reach that destination, which is exactly the address other devices on the
// same network reach this PC on.
#[cfg(desktop)]
#[tauri::command]
fn local_lan_ip() -> Result<String, String> {
  use std::net::UdpSocket;
  let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
  socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
  socket.local_addr().map(|addr| addr.ip().to_string()).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Desktop corner alert (overdue SARs / concerns)
//
// The main window decides when an alert is due and hands over a small payload
// (a greeting and a few count lines - never case details). This side only owns
// the little always-on-top window in the bottom-right corner of the screen and
// passes the person's choice (open / snooze / dismiss) back to the main window.
// The popup window itself has no Firebase and no app data: it reads the
// payload from here and reports one action back.
// ---------------------------------------------------------------------------
#[cfg(desktop)]
const ALERT_LABEL: &str = "alert";
#[cfg(desktop)]
const ALERT_WIDTH: f64 = 372.0;
#[cfg(desktop)]
const ALERT_HEIGHT: f64 = 232.0;
#[cfg(desktop)]
const ALERT_MARGIN: f64 = 16.0;
// Safety net: the popup closes itself after ~15s, but if its page ever failed
// to load or script, this stops it sitting on top of someone's screen.
#[cfg(desktop)]
const ALERT_FAILSAFE_SECS: u64 = 30;

#[cfg(desktop)]
#[derive(Default)]
struct AlertState {
  payload: Mutex<Option<serde_json::Value>>,
  generation: AtomicU64,
}

#[cfg(desktop)]
fn close_alert_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window(ALERT_LABEL) {
    let _ = window.close();
  }
}

#[cfg(desktop)]
fn show_alert(app: &tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
  let state = app.state::<AlertState>();
  *state.payload.lock().map_err(|e| e.to_string())? = Some(payload);
  let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;

  // Already on screen: refresh what it says and restart its countdown rather
  // than creating a second window.
  if let Some(existing) = app.get_webview_window(ALERT_LABEL) {
    let _ = existing.eval("window.__refreshAlert && window.__refreshAlert()");
    return Ok(());
  }

  let monitor = app
    .primary_monitor()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No monitor found".to_string())?;
  let work = monitor.work_area();
  let scale = monitor.scale_factor();
  // Bottom-right of the usable area (i.e. above the taskbar), in logical pixels.
  let x = (work.position.x as f64 + work.size.width as f64) / scale - ALERT_WIDTH - ALERT_MARGIN;
  let y = (work.position.y as f64 + work.size.height as f64) / scale - ALERT_HEIGHT - ALERT_MARGIN;

  let window = WebviewWindowBuilder::new(app, ALERT_LABEL, WebviewUrl::App("alert.html".into()))
    .title("Primovex alert")
    .visible(false)
    .inner_size(ALERT_WIDTH, ALERT_HEIGHT)
    .position(x, y)
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    // Never take the keyboard: someone may be typing in another program.
    .focused(false)
    .focusable(false)
    .shadow(true)
    .build()
    .map_err(|e| e.to_string())?;

  // Windows gives even a borderless window an invisible resize border, so the
  // outer frame is a little bigger than the content. Nudge it so the visible
  // card, not the frame, sits ALERT_MARGIN from the corner of the usable area.
  if let (Ok(outer), Ok(inner_pos), Ok(inner_size)) = (window.outer_position(), window.inner_position(), window.inner_size()) {
    let margin = (ALERT_MARGIN * scale).round() as i32;
    let target_x = work.position.x + work.size.width as i32 - inner_size.width as i32 - margin;
    let target_y = work.position.y + work.size.height as i32 - inner_size.height as i32 - margin;
    let _ = window.set_position(PhysicalPosition::new(target_x - (inner_pos.x - outer.x), target_y - (inner_pos.y - outer.y)));
  }
  let _ = window.show();

  let handle = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(std::time::Duration::from_secs(ALERT_FAILSAFE_SECS));
    if handle.state::<AlertState>().generation.load(Ordering::SeqCst) == generation {
      close_alert_window(&handle);
    }
  });
  Ok(())
}

// ---------------------------------------------------------------------------
// Shelly battery-sensor wake listener (e.g. Shelly H&T Gen3)
//
// A battery Shelly sleeps almost all the time to save power, waking briefly
// on its own schedule to take a reading - unlike a mains-powered one, polling
// its IP on a timer would mostly find it asleep. Instead the device is set up
// (in the Shelly app, under that device's Actions/Webhooks) to call this
// listener the instant it wakes. The call itself carries no reading - it's
// just a "read me now, while I'm awake" trigger; the actual value is then
// pulled from the device's own local API the same way a mains-powered
// thermometer already is (see readShellyStatus in shellyLocalPoller.js nb.
// Nothing here ever leaves the practice's own network, and this never
// accepts a request that isn't a bare wake ping.
#[cfg(desktop)]
const SHELLY_WAKE_PORT: u16 = 47281;

// Whether the wake listener managed to open its port (another program may already be using it), so the Connect page
// can say so instead of a battery sensor just silently never reporting.
#[cfg(desktop)]
static SHELLY_LISTENER_UP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(desktop)]
#[tauri::command]
fn shelly_listener_status() -> bool {
  SHELLY_LISTENER_UP.load(std::sync::atomic::Ordering::Relaxed)
}

#[cfg(desktop)]
fn start_shelly_wake_listener(app: tauri::AppHandle) {
  std::thread::spawn(move || {
    let server = match tiny_http::Server::http(format!("0.0.0.0:{SHELLY_WAKE_PORT}")) {
      Ok(server) => server,
      Err(err) => {
        log::warn!("Could not start the Shelly wake listener on port {SHELLY_WAKE_PORT}: {err}");
        return;
      }
    };
    SHELLY_LISTENER_UP.store(true, std::sync::atomic::Ordering::Relaxed);
    for request in server.incoming_requests() {
      let remote_ip = request.remote_addr().map(|addr| addr.ip().to_string());
      let is_wake_ping = request.url().starts_with("/shelly-wake");
      // Always answer immediately - the device is only awake briefly and
      // shouldn't be left waiting on a response it doesn't need.
      let _ = request.respond(tiny_http::Response::from_string("ok"));
      if is_wake_ping {
        if let Some(ip) = remote_ip {
          log::info!("Shelly wake ping from {ip}");
          let _ = app.emit("shelly-device-woke", ip);
        }
      }
    }
  });
}

// async so the window is created off the main thread (creating a window from a
// synchronous command can deadlock on Windows).
#[cfg(desktop)]
#[tauri::command]
async fn show_alert_popup(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
  show_alert(&app, payload)
}

#[cfg(desktop)]
#[tauri::command]
fn alert_payload(state: tauri::State<AlertState>) -> Option<serde_json::Value> {
  state.payload.lock().ok().and_then(|p| p.clone())
}

#[cfg(desktop)]
#[tauri::command]
async fn close_alert_popup(app: tauri::AppHandle) -> Result<(), String> {
  close_alert_window(&app);
  Ok(())
}

// The popup reports what the person chose. Opening also brings the main
// window forward (restoring it if it was minimised); every action is passed on
// to the main window, which owns the snooze / dismiss bookkeeping.
#[cfg(desktop)]
#[tauri::command]
async fn alert_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
  const ALLOWED: [&str; 6] = ["open", "snooze_1h", "snooze_later", "snooze_tomorrow", "dismiss", "timeout"];
  if !ALLOWED.contains(&action.as_str()) {
    return Err("Unknown alert action".to_string());
  }
  close_alert_window(&app);
  if action == "open" {
    if let Some(main) = app.get_webview_window("main") {
      let _ = main.unminimize();
      let _ = main.show();
      let _ = main.set_focus();
    }
  }
  app.emit_to("main", "alert-action", action).map_err(|e| e.to_string())
}


// ---------------------------------------------------------------------------
// Pulse orb on the desktop
//
// When Primovex is minimised, or closed to the system tray, the Pulse orb sits on
// the desktop in its own small always-on-top window, so the practice can see at a
// glance whether anything has changed. It knows nothing about the app: the main
// window tells this side the little it should say (a score and a short note) and
// this side only owns the window, its place on screen, the tray icon, and the
// "close button hides to the tray" behaviour. Double-clicking the orb (or the
// tray icon) brings the main window back.
//
// Nothing here runs unless the signed-in person has it switched on, and signing
// out removes the orb and makes the close button quit as normal.
// ---------------------------------------------------------------------------
#[cfg(desktop)]
const ORB_LABEL: &str = "orb";
#[cfg(desktop)]
const ORB_SIZE: f64 = 132.0;
#[cfg(desktop)]
const ORB_MARGIN: f64 = 24.0;
#[cfg(desktop)]
const ORB_POSITION_FILE: &str = "orb-position.json";

#[cfg(desktop)]
#[derive(Default)]
struct OrbState {
  enabled: AtomicBool,
  close_to_tray: AtomicBool,
  signed_in: AtomicBool,
  // The window's side in logical pixels, from the person's orb size setting (0 = not told yet).
  size: AtomicU32,
  quitting: AtomicBool,
  payload: Mutex<Option<serde_json::Value>>,
  last_saved: Mutex<Option<(i32, i32)>>,
}

#[cfg(desktop)]
fn orb_position_path(app: &tauri::AppHandle) -> Option<PathBuf> {
  app.path().app_config_dir().ok().map(|dir| dir.join(ORB_POSITION_FILE))
}

// The orb window's side: the person's Orb size setting (small, medium or large) sets the box
// the orb is drawn in inside the app; the desktop window is that box plus room for the glow.
#[cfg(desktop)]
fn orb_window_size(app: &tauri::AppHandle) -> f64 {
  match app.state::<OrbState>().size.load(Ordering::SeqCst) {
    0 => ORB_SIZE,
    px => px as f64,
  }
}

// The last place the person left the orb, if it is still on a connected screen.
#[cfg(desktop)]
fn saved_orb_position(app: &tauri::AppHandle) -> Option<PhysicalPosition<i32>> {
  let text = fs::read_to_string(orb_position_path(app)?).ok()?;
  let value: serde_json::Value = serde_json::from_str(&text).ok()?;
  let x = value.get("x")?.as_i64()? as i32;
  let y = value.get("y")?.as_i64()? as i32;
  let on_screen = app.available_monitors().ok()?.iter().any(|m| {
    let pos = m.position();
    let size = m.size();
    x >= pos.x - 20 && y >= pos.y - 20 && x < pos.x + size.width as i32 - 40 && y < pos.y + size.height as i32 - 40
  });
  if on_screen {
    Some(PhysicalPosition::new(x, y))
  } else {
    None
  }
}

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
  }
}

#[cfg(desktop)]
fn close_orb_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window(ORB_LABEL) {
    let _ = window.close();
  }
}

#[cfg(desktop)]
fn open_orb_window(app: &tauri::AppHandle) -> Result<(), String> {
  if app.get_webview_window(ORB_LABEL).is_some() {
    return Ok(());
  }
  let monitor = app
    .primary_monitor()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No monitor found".to_string())?;
  let work = monitor.work_area();
  let scale = monitor.scale_factor();
  // Bottom-right of the usable area (above the taskbar) unless the person has moved it.
  let side = orb_window_size(app);
  let default_x = (work.position.x as f64 + work.size.width as f64) / scale - side - ORB_MARGIN;
  let default_y = (work.position.y as f64 + work.size.height as f64) / scale - side - ORB_MARGIN;

  let window = WebviewWindowBuilder::new(app, ORB_LABEL, WebviewUrl::App("orb.html".into()))
    .title("Primovex orb")
    .visible(false)
    .inner_size(side, side)
    .position(default_x, default_y)
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    // Never take the keyboard: someone may be typing in another program.
    .focused(false)
    .shadow(false)
    .build()
    .map_err(|e| e.to_string())?;

  if let Some(position) = saved_orb_position(app) {
    let _ = window.set_position(position);
  }
  let _ = window.show();
  Ok(())
}

// Whether the orb should be on the desktop right now: it is switched on, someone is
// signed in, and the main window is out of the way (minimised, or hidden in the tray).
#[cfg(desktop)]
fn orb_wanted(app: &tauri::AppHandle) -> bool {
  let state = app.state::<OrbState>();
  if !state.enabled.load(Ordering::SeqCst) || !state.signed_in.load(Ordering::SeqCst) || state.quitting.load(Ordering::SeqCst) {
    return false;
  }
  match app.get_webview_window("main") {
    Some(main) => main.is_minimized().unwrap_or(false) || !main.is_visible().unwrap_or(true),
    None => false,
  }
}

#[cfg(desktop)]
fn start_orb_watcher(app: tauri::AppHandle) {
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_millis(600));
    if orb_wanted(&app) {
      if app.get_webview_window(ORB_LABEL).is_none() {
        if let Err(err) = open_orb_window(&app) {
          log::warn!("Could not show the Pulse orb: {err}");
        }
      }
    } else if app.get_webview_window(ORB_LABEL).is_some() {
      close_orb_window(&app);
    }
    remember_orb_position(&app);
  });
}

// Writes the orb's position when it has moved, so it comes back where it was left.
#[cfg(desktop)]
fn remember_orb_position(app: &tauri::AppHandle) {
  let (Some(window), Some(path)) = (app.get_webview_window(ORB_LABEL), orb_position_path(app)) else { return };
  let Ok(position) = window.outer_position() else { return };
  let current = (position.x, position.y);
  let state = app.state::<OrbState>();
  let Ok(mut saved) = state.last_saved.lock() else { return };
  if *saved == Some(current) {
    return;
  }
  *saved = Some(current);
  if let Some(dir) = path.parent() {
    let _ = fs::create_dir_all(dir);
  }
  let _ = fs::write(path, serde_json::json!({ "x": current.0, "y": current.1 }).to_string());
}

// What the main window says about itself and the person's settings. Signing out sends
// signed_in = false, which removes the orb and makes the close button quit as normal.
#[cfg(desktop)]
#[tauri::command]
fn orb_configure(app: tauri::AppHandle, enabled: bool, close_to_tray: bool, signed_in: bool, box_px: Option<u32>) {
  let state = app.state::<OrbState>();
  if let Some(px) = box_px {
    // The in-app orb box (70, 88 or 108) with room for the glow, kept within sensible limits.
    let side = ((px as f64) * ORB_SIZE / 108.0).round().clamp(60.0, 200.0) as u32;
    state.size.store(side, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window(ORB_LABEL) {
      let _ = window.set_size(tauri::LogicalSize::new(side as f64, side as f64));
    }
  }
  state.enabled.store(enabled, Ordering::SeqCst);
  state.close_to_tray.store(close_to_tray, Ordering::SeqCst);
  state.signed_in.store(signed_in, Ordering::SeqCst);
  if !signed_in || !enabled {
    close_orb_window(&app);
  }
}

// The short status the orb shows (score, whether anything changed, a line of text).
// Counts and a sentence only, never case or patient detail.
#[cfg(desktop)]
#[tauri::command]
fn orb_set_state(app: tauri::AppHandle, payload: serde_json::Value) {
  if let Ok(mut slot) = app.state::<OrbState>().payload.lock() {
    *slot = Some(payload.clone());
  }
  if let (Some(window), Ok(json)) = (app.get_webview_window(ORB_LABEL), serde_json::to_string(&payload)) {
    let _ = window.eval(&format!("window.__setOrb && window.__setOrb({json})"));
  }
}

#[cfg(desktop)]
#[tauri::command]
fn orb_payload(state: tauri::State<OrbState>) -> Option<serde_json::Value> {
  state.payload.lock().ok().and_then(|p| p.clone())
}

#[cfg(desktop)]
#[tauri::command]
async fn orb_open_main(app: tauri::AppHandle) -> Result<(), String> {
  show_main_window(&app);
  close_orb_window(&app);
  Ok(())
}

#[cfg(desktop)]
#[tauri::command]
async fn orb_drag(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window(ORB_LABEL) {
    window.start_dragging().map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // Must be the first plugin: a second Primovex tells the first to show itself, then quits. Without this, closing Primovex to the
  // tray and opening it again left two copies running, each with its own Pulse orb on the desktop.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    show_main_window(app);
  }));

  let builder = builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      open_clinflow_pdf,
      #[cfg(desktop)]
      docman_folders,
      #[cfg(desktop)]
      choose_docman_folder,
      #[cfg(desktop)]
      save_docman_pdf,
      #[cfg(desktop)]
      list_incoming_scans,
      #[cfg(desktop)]
      read_incoming_scan,
      #[cfg(desktop)]
      finish_incoming_scan,
      #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
      open_storage_pdf,
      #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
      fetch_local_device_reading,
      #[cfg(desktop)]
      local_lan_ip,
      #[cfg(desktop)]
      shelly_listener_status,
      #[cfg(desktop)]
      show_alert_popup,
      #[cfg(desktop)]
      alert_payload,
      #[cfg(desktop)]
      close_alert_popup,
      #[cfg(desktop)]
      alert_action,
      #[cfg(desktop)]
      orb_configure,
      #[cfg(desktop)]
      orb_set_state,
      #[cfg(desktop)]
      orb_payload,
      #[cfg(desktop)]
      orb_open_main,
      #[cfg(desktop)]
      orb_drag
    ]);

  // checks for a newer signed release of the desktop app (see src/release/updateService.js); not on the phone
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

  // the system folder picker, used only to choose the two Docman upload folders (see choose_docman_folder)
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_dialog::init());

  #[cfg(desktop)]
  let builder = builder.manage(AlertState::default()).manage(OrbState::default());

  // The close button hides Primovex to the system tray (instead of quitting) when the
  // signed-in person has that switched on. Signed out, or choosing Quit from the tray
  // menu, it quits as normal.
  #[cfg(desktop)]
  let builder = builder.on_window_event(|window, event| {
    if window.label() != "main" {
      return;
    }
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
      let app = window.app_handle();
      let state = app.state::<OrbState>();
      if state.signed_in.load(Ordering::SeqCst) && state.close_to_tray.load(Ordering::SeqCst) && !state.quitting.load(Ordering::SeqCst) {
        api.prevent_close();
        let _ = window.hide();
      }
    }
  });

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

      #[cfg(desktop)]
      start_shelly_wake_listener(app.handle().clone());

      #[cfg(desktop)]
      {
        let open_item = MenuItem::with_id(app, "open", "Open Primovex", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Quit Primovex", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
        let mut tray = TrayIconBuilder::new()
          .tooltip("Primovex")
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => {
              app.state::<OrbState>().quitting.store(true, Ordering::SeqCst);
              app.exit(0);
            }
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
              show_main_window(tray.app_handle());
            }
          });
        if let Some(icon) = app.default_window_icon() {
          tray = tray.icon(icon.clone());
        }
        tray.build(app)?;
        start_orb_watcher(app.handle().clone());
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Primovex");
}
