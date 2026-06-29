// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The panic hook installed inside run() handles logging for all threads.
    // If run() itself panics (e.g. Tauri init failure), stderr is the last resort.
    match parse_serve_args(std::env::args().skip(1).collect()) {
        Ok(Some(options)) => {
            if let Err(err) = kirodex_lib::run_serve(options) {
                eprintln!("{err}");
                std::process::exit(1);
            }
        }
        Ok(None) => kirodex_lib::run(),
        Err(err) => {
            eprintln!("{err}");
            eprintln!(
                "Usage: kirodex serve [--host 127.0.0.1] [--port 9230] [--token TOKEN] [--dist PATH] [--dev-ui URL]"
            );
            std::process::exit(2);
        }
    }
}

fn parse_serve_args(args: Vec<String>) -> Result<Option<kirodex_lib::web::ServeOptions>, String> {
    if args.is_empty() {
        return Ok(None);
    }
    if args.first().map(String::as_str) != Some("serve") {
        return Err(format!("Unknown command: {}", args[0]));
    }

    let mut options = kirodex_lib::web::ServeOptions::default();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--host" => {
                i += 1;
                options.host = args.get(i).cloned().ok_or("--host requires a value")?;
            }
            "--port" => {
                i += 1;
                let raw = args.get(i).ok_or("--port requires a value")?;
                options.port = raw.parse().map_err(|_| format!("Invalid --port value: {raw}"))?;
            }
            "--token" => {
                i += 1;
                options.token = Some(args.get(i).cloned().ok_or("--token requires a value")?);
            }
            "--dist" => {
                i += 1;
                options.dist = Some(std::path::PathBuf::from(
                    args.get(i).cloned().ok_or("--dist requires a value")?,
                ));
            }
            "--dev-ui" => {
                i += 1;
                options.dev_ui = Some(args.get(i).cloned().ok_or("--dev-ui requires a value")?);
            }
            "--help" | "-h" => {
                return Err("Kirodex web server mode".to_string());
            }
            other => return Err(format!("Unknown serve option: {other}")),
        }
        i += 1;
    }
    Ok(Some(options))
}
