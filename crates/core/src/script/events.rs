use serde_json::Value;

use super::{Anchor, EditError, NamedEvent};
use crate::time::Ms;

pub fn named(
    id: String,
    name: String,
    data: Option<Value>,
    anchor: Anchor,
    offset: Ms,
) -> Result<NamedEvent, EditError> {
    Ok(NamedEvent {
        id,
        name: event_name(name)?,
        data,
        anchor,
        offset,
    })
}

pub fn rename(event: &mut NamedEvent, name: String, data: Option<Value>) -> Result<(), EditError> {
    event.name = event_name(name)?;
    event.data = data;
    Ok(())
}

fn event_name(name: String) -> Result<String, EditError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(EditError::UnnamedEvent);
    }
    Ok(name.to_string())
}
