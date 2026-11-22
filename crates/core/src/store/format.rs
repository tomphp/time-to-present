use serde::Serialize;
use serde_json::Value;

use super::{FORMAT_VERSION, Presentation, StoreError};

type Migration = fn(&mut Value);

/// `MIGRATIONS[n]` upgrades a document from `formatVersion` n to n + 1.
const MIGRATIONS: [Migration; FORMAT_VERSION as usize] = [name_becomes_title];

fn name_becomes_title(document: &mut Value) {
    if let Some(name) = document
        .as_object_mut()
        .and_then(|fields| fields.remove("name"))
    {
        document["title"] = name;
    }
}

pub struct Parsed {
    pub presentation: Presentation,
    pub migrated: bool,
}

pub fn parse(json: &str) -> Result<Parsed, StoreError> {
    let mut document: Value = serde_json::from_str(json)?;
    let found = document["formatVersion"]
        .as_u64()
        .and_then(|version| u32::try_from(version).ok())
        .ok_or_else(|| StoreError::Malformed("formatVersion".to_string()))?;
    if found > FORMAT_VERSION {
        return Err(StoreError::NewerFormat {
            found,
            supported: FORMAT_VERSION,
        });
    }
    for migration in &MIGRATIONS[found as usize..] {
        migration(&mut document);
    }
    Ok(Parsed {
        presentation: serde_json::from_value(document)?,
        migrated: found < FORMAT_VERSION,
    })
}

pub fn to_json(presentation: &Presentation) -> Result<String, StoreError> {
    Ok(format!(
        "{{\n  \"formatVersion\": {FORMAT_VERSION},\n  \"title\": {},\n  \"presentationSize\": {},\n  \"recordings\": {},\n  \"words\": {},\n  \"namedEvents\": {}\n}}\n",
        serde_json::to_string(&presentation.title)?,
        serde_json::to_string(&presentation.presentation_size)?,
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
