use crate::script::Script;

/// The linear undo/redo stack: a snapshot of the Script before each step, without limit,
/// with the Named Events the step newly gave a Moved badge.
#[derive(Debug, Default)]
pub struct History {
    undo: Vec<Step>,
    redo: Vec<Step>,
}

#[derive(Debug)]
struct Step {
    script: Script,
    moved: Vec<String>,
}

impl History {
    pub fn record(&mut self, before: Script, moved: Vec<String>) {
        self.undo.push(Step {
            script: before,
            moved,
        });
        self.redo.clear();
    }

    /// Steps back, returning the events the undone step gave a Moved badge.
    pub fn undo(&mut self, current: &mut Script) -> Option<&[String]> {
        Self::step(&mut self.undo, &mut self.redo, current)
    }

    /// Steps forward, returning the events the redone step gave a Moved badge.
    pub fn redo(&mut self, current: &mut Script) -> Option<&[String]> {
        Self::step(&mut self.redo, &mut self.undo, current)
    }

    fn step<'a>(
        from: &mut Vec<Step>,
        to: &'a mut Vec<Step>,
        current: &mut Script,
    ) -> Option<&'a [String]> {
        let Step { script, moved } = from.pop()?;
        to.push(Step {
            script: std::mem::replace(current, script),
            moved,
        });
        to.last().map(|step| step.moved.as_slice())
    }
}
