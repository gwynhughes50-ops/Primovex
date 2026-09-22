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
      fetch_local_device_reading,
      #[cfg(desktop)]
      local_lan_ip,
      #[cfg(desktop)]
      show_alert_popup,
      #[cfg(desktop)]
      alert_payload,
      #[cfg(desktop)]
      close_alert_popup,
      #[cfg(desktop)]
      alert_action
    ]);

  #[cfg(desktop)]
  let builder = builder.manage(AlertState::default());

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

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Primovex");
}
