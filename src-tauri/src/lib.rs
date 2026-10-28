use tauri::{Manager, PhysicalSize, WebviewWindow};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// The window opens at this fraction of the monitor's usable height (taskbar
// excluded), keeping the width from tauri.conf.json.
const START_HEIGHT_FRACTION: f64 = 0.75;

fn fit_to_monitor(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let area = monitor.work_area().size;
    let width = window.inner_size()?.width.min(area.width);
    let height = (area.height as f64 * START_HEIGHT_FRACTION).round() as u32;
    window.set_size(PhysicalSize::new(width, height))?;
    window.center()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // The window starts hidden (tauri.conf.json) so it appears at its final size.
                if let Err(err) = fit_to_monitor(&window) {
                    eprintln!("could not size the window: {err}");
                }
                window.show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
