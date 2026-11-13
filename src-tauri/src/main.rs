// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--ssh-askpass") {
        std::process::exit(git_desktop_lib::ssh_askpass_entry());
    }
    git_desktop_lib::run()
}
