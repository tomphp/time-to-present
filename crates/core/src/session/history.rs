use crate::script::Script;

/// The linear undo/redo stack: a snapshot of the Script before each step, without limit,
/// with the Named Events the step newly badged as Moved.
#[derive(Debug, Default)]
pub struct History {
    undo: Vec<Step>,
    redo: Vec<Step>,
}

#[derive(Debug)]
struct Step {
    script: Script,
    badged: Vec<String>,
}

impl History {
    pub fn record(&mut self, before: Script, badged: Vec<String>) {
        self.undo.push(Step {
            script: before,
            badged,
        });
        self.redo.clear();
    }

    /// Steps back, returning the events the undone step badged.
    pub fn undo(&mut self, current: &mut Script) -> Option<&[String]> {
        Self::step(&mut self.undo, &mut self.redo, current)
    }

    /// Steps forward, returning the events the redone step badged.
    pub fn redo(&mut self, current: &mut Script) -> Option<&[String]> {
        Self::step(&mut self.redo, &mut self.undo, current)
    }

    fn step<'a>(
        from: &mut Vec<Step>,
        to: &'a mut Vec<Step>,
        current: &mut Script,
    ) -> Option<&'a [String]> {
        let Step { script, badged } = from.pop()?;
        to.push(Step {
            script: std::mem::replace(current, script),
            badged,
        });
        to.last().map(|step| step.badged.as_slice())
    }
}
