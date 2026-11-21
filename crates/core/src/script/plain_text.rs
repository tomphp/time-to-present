use super::BreakAfter;

/// The Words of plain text, each with the break the line endings after it make: one ends a
/// line, and a blank line between ends a paragraph.
pub fn words(text: &str) -> Vec<(String, Option<BreakAfter>)> {
    let mut words: Vec<(String, Option<BreakAfter>)> = Vec::new();
    let mut line_endings = 0;
    for (index, line) in text.lines().enumerate() {
        if index > 0 {
            line_endings += 1;
        }
        let mut tokens = line.split_whitespace().peekable();
        if tokens.peek().is_none() {
            continue;
        }
        if let Some((_, break_after)) = words.last_mut()
            && line_endings > 0
        {
            *break_after = Some(if line_endings > 1 {
                BreakAfter::Paragraph
            } else {
                BreakAfter::Line
            });
        }
        line_endings = 0;
        words.extend(tokens.map(|token| (token.to_string(), None)));
    }
    words
}
