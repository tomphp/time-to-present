use std::path::Path;
use std::process::Command;

use crate::support::{Harness, write};

#[tokio::test]
async fn the_app_folder_is_served_at_the_root_with_index_html_as_the_default() {
    let harness = Harness::start().await;
    let folder = harness.open_hello();
    write(&folder, "app/index.html", "<h1>Slides</h1>");
    write(&folder, "app/assets/main.js", "console.log('hi')");
    write(&folder, "app/deck/index.html", "<h1>Deck</h1>");

    let root = harness.get("/").await;
    assert_eq!(root.status(), 200);
    assert_eq!(root.text().await.unwrap(), "<h1>Slides</h1>");
    let script = harness.get("/assets/main.js").await;
    assert_eq!(script.status(), 200);
    assert_eq!(script.text().await.unwrap(), "console.log('hi')");
    assert_eq!(
        harness.get("/deck/").await.text().await.unwrap(),
        "<h1>Deck</h1>"
    );
    assert_eq!(harness.get("/missing.js").await.status(), 404);
}

#[tokio::test]
async fn app_files_are_revalidated_so_a_rebuild_shows_at_once() {
    let harness = Harness::start().await;
    let folder = harness.open_hello();
    write(&folder, "app/index.html", "<h1>Slides</h1>");

    let root = harness.get("/").await;

    assert_eq!(root.headers()["cache-control"], "no-cache");
}

#[tokio::test]
async fn app_src_and_the_presentation_file_are_never_served() {
    let harness = Harness::start().await;
    let folder = harness.open_hello();
    write(&folder, "app/index.html", "<h1>Slides</h1>");
    write(&folder, "app-src/main.ts", "secret");

    for path in [
        "/app-src/main.ts",
        "/presentation.json",
        "/../presentation.json",
    ] {
        assert_eq!(harness.get(path).await.status(), 404, "{path}");
    }
}

#[tokio::test]
async fn before_app_exists_the_root_explains_how_to_build_the_template() {
    let harness = Harness::start().await;
    harness.open_hello();

    let root = harness.get("/").await;

    assert_eq!(root.status(), 200);
    let page = root.text().await.unwrap();
    assert!(page.contains("app-src/"), "{page}");
    assert!(page.contains("npm run build"), "{page}");
}

#[tokio::test]
async fn with_nothing_open_the_root_says_so() {
    let harness = Harness::start().await;

    let root = harness.get("/").await;

    assert_eq!(root.status(), 200);
    assert!(root.text().await.unwrap().contains("No presentation open"));
}

#[tokio::test]
async fn files_under_app_ttp_are_shadowed_by_the_reserved_prefix_and_warned_about() {
    let harness = Harness::start().await;
    let folder = harness.open_hello();
    write(&folder, "app/index.html", "<h1>Slides</h1>");
    assert_eq!(harness.server.status().shadow_warning, None);
    write(&folder, "app/_ttp/v1/events", "not the stream");
    write(&folder, "app/_ttp/notes.txt", "shadowed");

    assert_eq!(harness.get("/_ttp/notes.txt").await.status(), 404);
    for disguised in [
        "/%5Fttp/notes.txt",
        "/./_ttp/notes.txt",
        "/%2e/_ttp/notes.txt",
        "//_ttp/notes.txt",
        "/_TTP/notes.txt",
    ] {
        assert_eq!(harness.raw_status(disguised).await, 404, "{disguised}");
    }
    assert_eq!(harness.raw_status("/./index.html").await, 200);
    assert_eq!(
        harness.get("/_ttp/v1/events").await.headers()["content-type"],
        "text/event-stream"
    );
    let warning = harness.server.status().shadow_warning.unwrap();
    assert!(warning.contains("app/_ttp/"), "{warning}");
}

#[tokio::test]
async fn the_built_template_is_served_from_app() {
    let harness = Harness::start().await;
    let folder = harness.open_hello();
    let template = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../templates/presentation");
    let vite = template.join("../../node_modules/.bin/vite");
    let status = Command::new(&vite)
        .args(["build", "--logLevel", "error", "--outDir"])
        .arg(folder.join("app"))
        .arg("--emptyOutDir")
        .current_dir(&template)
        .status()
        .unwrap_or_else(|error| panic!("run `npm install` to get {}: {error}", vite.display()));
    assert!(status.success());

    let root = harness.get("/").await;
    assert_eq!(root.status(), 200);
    let page = root.text().await.unwrap();
    assert!(page.contains(r#"id="slides""#), "{page}");
    let bundle = page
        .split(r#"src=""#)
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .expect("the page loads a script");
    assert_eq!(
        harness.get(bundle.trim_start_matches('.')).await.status(),
        200
    );
}
