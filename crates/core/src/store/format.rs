use serde::{Deserialize, Serialize};

use super::{FORMAT_VERSION, Presentation, StoreError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    format_version: u32,
}

pub fn version(json: &str) -> Result<u32, StoreError> {
    let Header { format_version } = serde_json::from_str(json)?;
    Ok(format_version)
}

pub fn to_json(presentation: &Presentation) -> Result<String, StoreError> {
    Ok(format!(
        "{{\n  \"formatVersion\": {FORMAT_VERSION},\n  \"title\": {},\n  \"recordings\": {},\n  \"words\": {},\n  \"namedEvents\": {}\n}}\n",
        serde_json::to_string(&presentation.title)?,
        one_per_line(&presentation.recordings)?,
        one_per_line(&presentation.script.words)?,
        one_per_line(&presentation.script.named_events)?,
    ))
}

fn one_per_line<T: Serialize>(items: &[T]) -> Result<String, StoreError> {
    if items.is_empty() {
        return Ok("[]".to_string());
    }
    let lines = items
        .iter()
        .map(|item| Ok(format!("    {}", serde_json::to_string(item)?)))
        .collect::<Result<Vec<_>, StoreError>>()?;
    Ok(format!("[\n{}\n  ]", lines.join(",\n")))
}
