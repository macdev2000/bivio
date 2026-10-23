// Su Windows, in release, evita la finestra della console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bivio_lib::run()
}
